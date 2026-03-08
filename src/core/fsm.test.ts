import { describe, expect, it } from "bun:test"
import { createMachine, createPressMachine } from "./fsm"
import { classifyClicks, createEventStream, dragSession } from "./event_stream"

type DragEvent =
  | { type: "PRESS"; point: { x: number; y: number } }
  | { type: "DRAG_START"; point: { x: number; y: number } }
  | { type: "DRAG_MOVE"; point: { x: number; y: number } }
  | { type: "RELEASE"; point: { x: number; y: number } }
  | { type: "CANCEL"; reason: string }
  | { type: "DOUBLE_CLICK" }

type DragState = "idle" | "pressed" | "dragging"
type CounterContext = { count: number; last: string }
type DragContext = { origin: { x: number; y: number }; last: { x: number; y: number }; cancelled: boolean }

describe("fsm", () => {
  it("creates a machine, evaluates guards, runs reduce/effect, and resets", () => {
    const effects: string[] = []
    const machine = createMachine<DragState, DragEvent, CounterContext>({
      initial: "idle",
      context: { count: 0, last: "none" },
      states: {
        idle: {
          on: {
            PRESS: {
              target: "pressed",
              reduce: (_snapshot: { state: DragState; context: CounterContext }, event: Extract<DragEvent, { type: "PRESS" }>) => ({
                last: `${event.point.x},${event.point.y}`,
              }),
              effect: () => effects.push("pressed"),
            },
            DOUBLE_CLICK: {
              guard: () => false,
            },
          },
        },
        pressed: {
          on: {
            RELEASE: {
              target: "idle",
              reduce: (snapshot: { state: DragState; context: CounterContext }) => ({ count: snapshot.context.count + 1 }),
            },
          },
        },
        dragging: {
          on: {},
        },
      },
    })

    const snapshots: string[] = []
    const sub = machine.subscribe((snapshot) => snapshots.push(`${snapshot.state}:${snapshot.context.count}:${snapshot.context.last}`))

    expect(machine.snapshot().state).toBe("idle")
    expect(machine.can({ type: "PRESS", point: { x: 10, y: 20 } })).toBe(true)
    expect(machine.can({ type: "DOUBLE_CLICK" })).toBe(false)

    const press = machine.send({ type: "PRESS", point: { x: 10, y: 20 } })
    expect(press.changed).toBe(true)
    expect(machine.matches("pressed")).toBe(true)
    expect(machine.snapshot().context.last).toBe("10,20")
    expect(effects).toEqual(["pressed"])

    const release = machine.send({ type: "RELEASE", point: { x: 10, y: 20 } })
    expect(release.changed).toBe(true)
    expect(machine.matches("idle")).toBe(true)
    expect(machine.snapshot().context.count).toBe(1)

    const reset = machine.reset()
    expect(reset.changed).toBe(true)
    expect(machine.snapshot()).toEqual({ state: "idle", context: { count: 0, last: "none" } })
    expect(snapshots).toEqual([
      "idle:0:none",
      "pressed:0:10,20",
      "idle:1:10,20",
      "idle:0:none",
    ])

    sub.unsubscribe()
  })

  it("works with event_stream for click and drag semantics", () => {
    const clicks = createEventStream<{ x: number; y: number }>()
    const down = createEventStream<{ x: number; y: number }>()
    const move = createEventStream<{ x: number; y: number }>()
    const up = createEventStream<{ x: number; y: number }>()
    const cancel = createEventStream<string>()

    const machine = createMachine<DragState, DragEvent, DragContext>({
      initial: "idle",
      context: { origin: { x: 0, y: 0 }, last: { x: 0, y: 0 }, cancelled: false },
      states: {
        idle: {
          on: {
            PRESS: {
              target: "pressed",
              reduce: (_snapshot: { state: DragState; context: DragContext }, event: Extract<DragEvent, { type: "PRESS" }>) => ({
                origin: event.point,
                last: event.point,
                cancelled: false,
              }),
            },
            DOUBLE_CLICK: {
              reduce: (snapshot: { state: DragState; context: DragContext }) => ({ cancelled: snapshot.context.cancelled }),
            },
          },
        },
        pressed: {
          on: {
            DRAG_START: {
              target: "dragging",
              reduce: (_snapshot: { state: DragState; context: DragContext }, event: Extract<DragEvent, { type: "DRAG_START" }>) => ({ last: event.point }),
            },
            RELEASE: {
              target: "idle",
              reduce: (_snapshot: { state: DragState; context: DragContext }, event: Extract<DragEvent, { type: "RELEASE" }>) => ({ last: event.point }),
            },
            CANCEL: {
              target: "idle",
              reduce: () => ({ cancelled: true }),
            },
          },
        },
        dragging: {
          on: {
            DRAG_MOVE: {
              reduce: (_snapshot: { state: DragState; context: DragContext }, event: Extract<DragEvent, { type: "DRAG_MOVE" }>) => ({ last: event.point }),
            },
            RELEASE: {
              target: "idle",
              reduce: (_snapshot: { state: DragState; context: DragContext }, event: Extract<DragEvent, { type: "RELEASE" }>) => ({ last: event.point }),
            },
            CANCEL: {
              target: "idle",
              reduce: () => ({ cancelled: true }),
            },
          },
        },
      },
    })

    dragSession({
      down: down.stream,
      move: move.stream,
      up: up.stream,
      cancel: cancel.stream,
      point: (value) => value,
      thresholdSq: 16,
    }).subscribe((event) => {
      if (event.kind === "start") machine.send({ type: "DRAG_START", point: event.current })
      else if (event.kind === "move") machine.send({ type: "DRAG_MOVE", point: event.current })
      else if (event.kind === "end") machine.send({ type: "RELEASE", point: event.up })
      else machine.send({ type: "CANCEL", reason: event.reason })
    })

    classifyClicks({
      clicks: clicks.stream,
      windowMs: 250,
      now: (() => {
        let current = 0
        return () => current++
      })(),
      setTimer: (fn) => {
        fn()
        return 0
      },
      clearTimer: () => {},
    }).subscribe((event) => {
      if (event.kind === "double") machine.send({ type: "DOUBLE_CLICK" })
    })

    machine.send({ type: "PRESS", point: { x: 10, y: 10 } })
    down.emit({ x: 10, y: 10 })
    move.emit({ x: 12, y: 12 })
    expect(machine.matches("pressed")).toBe(true)

    move.emit({ x: 20, y: 20 })
    expect(machine.matches("dragging")).toBe(true)
    expect(machine.snapshot().context.last).toEqual({ x: 20, y: 20 })

    up.emit({ x: 24, y: 24 })
    expect(machine.matches("idle")).toBe(true)
    expect(machine.snapshot().context.last).toEqual({ x: 24, y: 24 })

    machine.send({ type: "PRESS", point: { x: 0, y: 0 } })
    down.emit({ x: 0, y: 0 })
    cancel.emit("blur")
    expect(machine.matches("idle")).toBe(true)
    expect(machine.snapshot().context.cancelled).toBe(true)

    clicks.emit({ x: 1, y: 1 })
    clicks.emit({ x: 1, y: 1 })
    expect(machine.matches("idle")).toBe(true)
  })

  it("provides a reusable press machine helper", () => {
    const machine = createPressMachine()

    expect(machine.matches("idle")).toBe(true)
    machine.send({ type: "PRESS", point: { x: 8, y: 10 } })
    expect(machine.matches("pressed")).toBe(true)
    expect(machine.snapshot().context.originPointer).toEqual({ x: 8, y: 10 })

    machine.send({ type: "CANCEL", reason: "leave" })
    expect(machine.matches("idle")).toBe(true)

    machine.send({ type: "PRESS", point: { x: 12, y: 14 } })
    machine.send({ type: "RELEASE", point: { x: 16, y: 18 } })
    expect(machine.matches("idle")).toBe(true)
    expect(machine.snapshot().context.lastPointer).toEqual({ x: 16, y: 18 })
  })
})
