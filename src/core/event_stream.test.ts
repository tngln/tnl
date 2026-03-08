import { describe, expect, it } from "bun:test"
import { classifyClicks, createEventStream, dragSession, mergeStreams } from "./event_stream"

function createFakeClock() {
  let now = 0
  let nextId = 1
  const timers = new Map<number, { due: number; fn: () => void }>()

  return {
    now: () => now,
    setTimer(fn: () => void, ms: number) {
      const id = nextId++
      timers.set(id, { due: now + ms, fn })
      return id
    },
    clearTimer(handle: unknown) {
      timers.delete(handle as number)
    },
    advance(ms: number) {
      now += ms
      const ready = [...timers.entries()]
        .filter(([, timer]) => timer.due <= now)
        .sort((a, b) => a[1].due - b[1].due)
      for (const [id, timer] of ready) {
        timers.delete(id)
        timer.fn()
      }
    },
  }
}

describe("event stream", () => {
  it("supports map, filter, merge, takeUntil, and once", () => {
    const a = createEventStream<number>()
    const b = createEventStream<number>()
    const stop = createEventStream<void>()
    const values: number[] = []

    const sub = mergeStreams(a.stream, b.stream)
      .map((value) => value * 2)
      .filter((value) => value % 4 === 0)
      .takeUntil(stop.stream)
      .once()
      .subscribe((value) => values.push(value))

    a.emit(1)
    a.emit(2)
    b.emit(4)
    stop.emit()
    b.emit(6)
    sub.unsubscribe()

    expect(values).toEqual([4])
  })

  it("classifies single and double clicks", () => {
    const clicks = createEventStream<{ id: string; x: number; y: number }>()
    const clock = createFakeClock()
    const events: Array<string> = []

    const sub = classifyClicks({
      clicks: clicks.stream,
      windowMs: 300,
      now: clock.now,
      setTimer: clock.setTimer,
      clearTimer: clock.clearTimer,
      canPair: (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2 <= 36,
    }).subscribe((event) => {
      if (event.kind === "single") events.push(`single:${event.value.id}`)
      else events.push(`double:${event.first.id}+${event.second.id}`)
    })

    clicks.emit({ id: "a", x: 10, y: 10 })
    clock.advance(299)
    expect(events).toEqual([])
    clock.advance(1)
    expect(events).toEqual(["single:a"])

    clicks.emit({ id: "b1", x: 10, y: 10 })
    clock.advance(100)
    clicks.emit({ id: "b2", x: 12, y: 12 })
    expect(events).toEqual(["single:a", "double:b1+b2"])
    clock.advance(300)
    expect(events).toEqual(["single:a", "double:b1+b2"])

    clicks.emit({ id: "c1", x: 10, y: 10 })
    clock.advance(301)
    clicks.emit({ id: "c2", x: 40, y: 40 })
    clock.advance(300)
    expect(events).toEqual(["single:a", "double:b1+b2", "single:c1", "single:c2"])

    sub.unsubscribe()
  })

  it("tracks drag session lifecycle and cancellation", () => {
    const down = createEventStream<{ x: number; y: number }>()
    const move = createEventStream<{ x: number; y: number }>()
    const up = createEventStream<{ x: number; y: number }>()
    const cancel = createEventStream<string>()
    const events: string[] = []

    const sub = dragSession({
      down: down.stream,
      move: move.stream,
      up: up.stream,
      cancel: cancel.stream,
      point: (value) => value,
      thresholdSq: 16,
    }).subscribe((event) => {
      if (event.kind === "start") events.push(`start:${event.current.x},${event.current.y}`)
      if (event.kind === "move") events.push(`move:${event.current.x},${event.current.y}`)
      if (event.kind === "end") events.push(`end:${event.up.x},${event.up.y}`)
      if (event.kind === "cancel") events.push(`cancel:${event.reason}:${event.started}`)
    })

    down.emit({ x: 10, y: 10 })
    move.emit({ x: 12, y: 12 })
    expect(events).toEqual([])

    move.emit({ x: 20, y: 20 })
    expect(events).toEqual(["start:20,20", "move:20,20"])

    move.emit({ x: 24, y: 24 })
    up.emit({ x: 28, y: 28 })
    expect(events).toEqual(["start:20,20", "move:20,20", "move:24,24", "end:28,28"])

    down.emit({ x: 0, y: 0 })
    cancel.emit("blur")
    expect(events).toEqual(["start:20,20", "move:20,20", "move:24,24", "end:28,28", "cancel:blur:false"])

    sub.unsubscribe()
  })
})
