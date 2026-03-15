import { describe, expect, it } from "bun:test"
import { audit, bufferCount, classifyClicks, classifySpatialClicks, createEventStream, debounce, delay, distinctUntilChanged, dragSession, filter, interactionCancelStream, keyChordSequence, map, mergeStreams, once, pairwise, pointerDragSession, sample, scan, skip, startWith, switchMap, take, takeUntil, throttle, type Scheduler, withLatestFrom } from "./event_stream"

function createFakeClock(): Scheduler & { advance(ms: number): void } {
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
      .pipe(
        map((value) => value * 2),
        filter((value) => value % 4 === 0),
        takeUntil(stop.stream),
        once(),
      )
      .subscribe((value) => values.push(value))

    a.emit(1)
    a.emit(2)
    b.emit(4)
    stop.emit()
    b.emit(6)
    sub.unsubscribe()

    expect(values).toEqual([4])
  })

  it("take limits emissions to N values", () => {
    const src = createEventStream<number>()
    const values: number[] = []
    const sub = src.stream.pipe(take(3)).subscribe((v) => values.push(v))
    for (let i = 1; i <= 5; i++) src.emit(i)
    sub.unsubscribe()
    expect(values).toEqual([1, 2, 3])
  })

  it("skip ignores the first N values", () => {
    const src = createEventStream<number>()
    const values: number[] = []
    const sub = src.stream.pipe(skip(2)).subscribe((v) => values.push(v))
    for (let i = 1; i <= 5; i++) src.emit(i)
    sub.unsubscribe()
    expect(values).toEqual([3, 4, 5])
  })

  it("startWith prepends a value before the source", () => {
    const src = createEventStream<number>()
    const values: number[] = []
    const sub = src.stream.pipe(startWith(0)).subscribe((v) => values.push(v))
    src.emit(1)
    sub.unsubscribe()
    expect(values).toEqual([0, 1])
  })

  it("distinctUntilChanged skips consecutive duplicates", () => {
    const src = createEventStream<number>()
    const values: number[] = []
    const sub = src.stream.pipe(distinctUntilChanged()).subscribe((v) => values.push(v))
    src.emit(1); src.emit(1); src.emit(2); src.emit(2); src.emit(1)
    sub.unsubscribe()
    expect(values).toEqual([1, 2, 1])
  })

  it("scan accumulates values with a reducer", () => {
    const src = createEventStream<number>()
    const values: number[] = []
    const sub = src.stream.pipe(scan((acc, v) => acc + v, 0)).subscribe((v) => values.push(v))
    src.emit(1); src.emit(2); src.emit(3)
    sub.unsubscribe()
    expect(values).toEqual([1, 3, 6])
  })

  it("pairwise emits consecutive pairs", () => {
    const src = createEventStream<string>()
    const values: [string, string][] = []
    const sub = src.stream.pipe(pairwise()).subscribe((v) => values.push(v))
    src.emit("a"); src.emit("b"); src.emit("c")
    sub.unsubscribe()
    expect(values).toEqual([["a", "b"], ["b", "c"]])
  })

  it("bufferCount collects values into fixed-size batches", () => {
    const src = createEventStream<number>()
    const values: number[][] = []
    const sub = src.stream.pipe(bufferCount(3)).subscribe((v) => values.push(v))
    for (let i = 1; i <= 7; i++) src.emit(i)
    sub.unsubscribe()
    expect(values).toEqual([[1, 2, 3], [4, 5, 6]])
  })

  it("withLatestFrom combines source with latest from another stream", () => {
    const src = createEventStream<string>()
    const other = createEventStream<number>()
    const values: [string, number][] = []
    const sub = src.stream.pipe(withLatestFrom(other.stream)).subscribe((v) => values.push(v))
    src.emit("a")              // no latest from other yet
    other.emit(1)
    src.emit("b")              // [b, 1]
    other.emit(2); other.emit(3)
    src.emit("c")              // [c, 3]
    sub.unsubscribe()
    expect(values).toEqual([["b", 1], ["c", 3]])
  })

  it("sample emits latest source value when notifier fires", () => {
    const src = createEventStream<number>()
    const tick = createEventStream<void>()
    const values: number[] = []
    const sub = src.stream.pipe(sample(tick.stream)).subscribe((v) => values.push(v))
    tick.emit()                // no source value yet
    src.emit(1); src.emit(2)
    tick.emit()                // 2
    tick.emit()                // already consumed
    src.emit(3)
    tick.emit()                // 3
    sub.unsubscribe()
    expect(values).toEqual([2, 3])
  })

  it("switchMap cancels the previous inner stream on new outer emission", () => {
    const src = createEventStream<string>()
    const values: string[] = []
    const inners = new Map<string, ReturnType<typeof createEventStream<string>>>()
    const sub = src.stream.pipe(switchMap((key) => {
      const inner = createEventStream<string>()
      inners.set(key, inner)
      return inner.stream
    })).subscribe((v) => values.push(v))

    src.emit("a")
    inners.get("a")!.emit("a1")
    inners.get("a")!.emit("a2")
    src.emit("b")
    inners.get("a")!.emit("a3")   // ignored, inner "a" was cancelled
    inners.get("b")!.emit("b1")
    sub.unsubscribe()
    expect(values).toEqual(["a1", "a2", "b1"])
  })

  it("debounce delays emission until silence", () => {
    const src = createEventStream<number>()
    const clock = createFakeClock()
    const values: number[] = []
    const sub = src.stream.pipe(debounce(100, clock)).subscribe((v) => values.push(v))
    src.emit(1); clock.advance(50)
    src.emit(2); clock.advance(50)
    src.emit(3); clock.advance(99)
    expect(values).toEqual([])
    clock.advance(1)
    expect(values).toEqual([3])
    sub.unsubscribe()
  })

  it("throttle rate-limits with leading and trailing emission", () => {
    const src = createEventStream<number>()
    const clock = createFakeClock()
    const values: number[] = []
    const sub = src.stream.pipe(throttle(100, clock)).subscribe((v) => values.push(v))
    src.emit(1)                // leading: immediate
    expect(values).toEqual([1])
    clock.advance(30); src.emit(2)
    clock.advance(30); src.emit(3)
    expect(values).toEqual([1])
    clock.advance(40)          // 100ms from first: trailing fires with latest (3)
    expect(values).toEqual([1, 3])
    sub.unsubscribe()
  })

  it("audit emits latest value at trailing edge of time window", () => {
    const src = createEventStream<number>()
    const clock = createFakeClock()
    const values: number[] = []
    const sub = src.stream.pipe(audit(100, clock)).subscribe((v) => values.push(v))
    src.emit(1); src.emit(2); src.emit(3)
    expect(values).toEqual([])
    clock.advance(100)
    expect(values).toEqual([3])
    src.emit(4)
    clock.advance(100)
    expect(values).toEqual([3, 4])
    sub.unsubscribe()
  })

  it("delay shifts each emission by a fixed amount", () => {
    const src = createEventStream<string>()
    const clock = createFakeClock()
    const values: string[] = []
    const sub = src.stream.pipe(delay(50, clock)).subscribe((v) => values.push(v))
    src.emit("a"); clock.advance(20)
    src.emit("b"); clock.advance(20)
    expect(values).toEqual([])
    clock.advance(10)          // 50ms from "a"
    expect(values).toEqual(["a"])
    clock.advance(20)          // 50ms from "b"
    expect(values).toEqual(["a", "b"])
    sub.unsubscribe()
  })

  it("classifies single and double clicks", () => {
    const clicks = createEventStream<{ id: string; x: number; y: number }>()
    const clock = createFakeClock()
    const events: Array<string> = []

    const sub = classifyClicks({
      clicks: clicks.stream,
      windowMs: 300,
      scheduler: clock,
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

  it("classifies spatial clicks using distance threshold", () => {
    const clicks = createEventStream<{ id: string; x: number; y: number; group: string }>()
    const clock = createFakeClock()
    const events: Array<string> = []

    const sub = classifySpatialClicks({
      clicks: clicks.stream,
      windowMs: 250,
      distanceSq: 25,
      scheduler: clock,
      canPair: (a, b) => a.group === b.group,
    }).subscribe((event) => {
      if (event.kind === "single") events.push(`single:${event.value.id}`)
      else events.push(`double:${event.first.id}+${event.second.id}`)
    })

    clicks.emit({ id: "a1", x: 0, y: 0, group: "g1" })
    clock.advance(100)
    clicks.emit({ id: "a2", x: 3, y: 4, group: "g1" })
    expect(events).toEqual(["double:a1+a2"])

    clicks.emit({ id: "b1", x: 0, y: 0, group: "g1" })
    clock.advance(50)
    clicks.emit({ id: "b2", x: 10, y: 10, group: "g1" })
    clock.advance(251)
    expect(events).toEqual(["double:a1+a2", "single:b1", "single:b2"])

    clicks.emit({ id: "c1", x: 1, y: 1, group: "g1" })
    clock.advance(50)
    clicks.emit({ id: "c2", x: 2, y: 2, group: "g2" })
    clock.advance(251)
    expect(events).toEqual(["double:a1+a2", "single:b1", "single:b2", "single:c1", "single:c2"])

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

  it("combines interaction cancel sources including buttons-released", () => {
    const localCancel = createEventStream<"leave">()
    const interrupted = createEventStream<"blur" | "pagehide">()
    const move = createEventStream<{ buttons: number }>()
    const reasons: string[] = []

    const sub = interactionCancelStream({
      cancel: localCancel.stream,
      interrupted: interrupted.stream,
      move: move.stream,
      buttons: (value) => value.buttons,
    }).subscribe((reason) => reasons.push(reason))

    move.emit({ buttons: 1 })
    localCancel.emit("leave")
    interrupted.emit("blur")
    move.emit({ buttons: 0 })
    interrupted.emit("pagehide")

    expect(reasons).toEqual(["leave", "blur", "buttons-released", "pagehide"])

    sub.unsubscribe()
  })

  it("builds pointer drag sessions with built-in button filtering and cancellation", () => {
    const down = createEventStream<{ x: number; y: number }>()
    const move = createEventStream<{ x: number; y: number; buttons: number }>()
    const up = createEventStream<{ x: number; y: number }>()
    const cancel = createEventStream<"leave">()
    const events: string[] = []

    const sub = pointerDragSession({
      down: down.stream,
      move: move.stream,
      up: up.stream,
      cancel: cancel.stream,
      thresholdSq: 9,
    }).subscribe((event) => {
      if (event.kind === "start") events.push(`start:${event.current.x},${event.current.y}`)
      if (event.kind === "move") events.push(`move:${event.current.x},${event.current.y}`)
      if (event.kind === "end") events.push(`end:${event.up.x},${event.up.y}`)
      if (event.kind === "cancel") events.push(`cancel:${event.reason}`)
    })

    down.emit({ x: 0, y: 0 })
    move.emit({ x: 1, y: 1, buttons: 1 })
    expect(events).toEqual([])

    move.emit({ x: 3, y: 0, buttons: 1 })
    expect(events).toEqual([])

    move.emit({ x: 4, y: 0, buttons: 1 })
    expect(events).toEqual(["start:4,0", "move:4,0"])

    move.emit({ x: 5, y: 0, buttons: 0 })
    expect(events).toEqual(["start:4,0", "move:4,0", "cancel:buttons-released"])

    down.emit({ x: 0, y: 0 })
    move.emit({ x: 4, y: 0, buttons: 1 })
    up.emit({ x: 6, y: 0 })
    expect(events).toEqual(["start:4,0", "move:4,0", "cancel:buttons-released", "start:4,0", "move:4,0", "end:6,0"])

    down.emit({ x: 0, y: 0 })
    cancel.emit("leave")
    expect(events).toEqual(["start:4,0", "move:4,0", "cancel:buttons-released", "start:4,0", "move:4,0", "end:6,0", "cancel:leave"])

    sub.unsubscribe()
  })

  it("detects a two-step key chord sequence within the time window", () => {
    const keys = createEventStream<{ code: string; ctrlKey: boolean }>()
    const clock = createFakeClock()
    const events: string[] = []

    const sub = keyChordSequence({
      keyDowns: keys.stream,
      steps: [(e) => e.ctrlKey && e.code === "KeyK", (e) => e.ctrlKey && e.code === "KeyS"],
      windowMs: 500,
      scheduler: clock,
    }).subscribe((matched) => events.push(matched.map((e) => e.code).join("+")))

    // Full match within window
    keys.emit({ code: "KeyK", ctrlKey: true })
    clock.advance(200)
    keys.emit({ code: "KeyS", ctrlKey: true })
    expect(events).toEqual(["KeyK+KeyS"])

    // First step then timeout — second step alone does not match step[0]
    keys.emit({ code: "KeyK", ctrlKey: true })
    clock.advance(600)
    keys.emit({ code: "KeyS", ctrlKey: true })
    expect(events).toEqual(["KeyK+KeyS"])

    // Wrong key in the middle resets; then retrying the whole sequence works
    keys.emit({ code: "KeyK", ctrlKey: true })
    keys.emit({ code: "KeyV", ctrlKey: true }) // mismatch, cursor resets
    keys.emit({ code: "KeyK", ctrlKey: true }) // restart step 0
    clock.advance(100)
    keys.emit({ code: "KeyS", ctrlKey: true }) // complete
    expect(events).toEqual(["KeyK+KeyS", "KeyK+KeyS"])

    sub.unsubscribe()
  })

  it("handles repeated first-step key as a restart for chord sequences", () => {
    const keys = createEventStream<{ code: string }>()
    const clock = createFakeClock()
    const events: string[] = []

    const sub = keyChordSequence({
      keyDowns: keys.stream,
      steps: [(e) => e.code === "KeyG", (e) => e.code === "KeyG"],
      windowMs: 300,
      scheduler: clock,
    }).subscribe((matched) => events.push(`gg:${matched.length}`))

    // G G = double-tap G
    keys.emit({ code: "KeyG" })
    clock.advance(100)
    keys.emit({ code: "KeyG" })
    expect(events).toEqual(["gg:2"])

    // G → timeout → G G = one complete pair
    keys.emit({ code: "KeyG" })
    clock.advance(400)
    keys.emit({ code: "KeyG" }) // first step of new pair (timer expired)
    clock.advance(100)
    keys.emit({ code: "KeyG" }) // completes
    expect(events).toEqual(["gg:2", "gg:2"])

    sub.unsubscribe()
  })
})
