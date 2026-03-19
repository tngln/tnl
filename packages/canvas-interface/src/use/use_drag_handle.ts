import { createEventStream, pointerDragSession, type InteractionCancelReason } from "../event_stream"
import type { Vec2 } from "../draw"
import { PointerUIEvent, UIElement } from "../ui_base"

export type DragHandlePhase = "idle" | "pressed" | "dragging"

export type DragGesture = {
  origin: Vec2
  current: Vec2
}

export type DragHandleBinding = {
  state: () => DragHandlePhase
  pressed: () => boolean
  dragging: () => boolean
  cancel: (reason: InteractionCancelReason) => void
}

export function useDragHandle(
  target: UIElement,
  opts: {
    enabled?: () => boolean
    shouldPress?: (event: PointerUIEvent) => boolean
    thresholdSq?: number
    cancelOnLeave?: boolean
    onPress?: (gesture: DragGesture, event: PointerUIEvent) => void
    onDragStart?: (gesture: DragGesture) => void
    onDragMove?: (gesture: DragGesture) => void
    onDragEnd?: (gesture: DragGesture) => void
    onPressRelease?: (gesture: DragGesture) => void
    onCancel?: (reason: InteractionCancelReason, gesture: DragGesture) => void
  } = {},
): DragHandleBinding {
  const enabled = opts.enabled ?? (() => true)
  const shouldPress = opts.shouldPress ?? (() => true)
  const thresholdSq = opts.thresholdSq ?? 0
  const downEvents = createEventStream<PointerUIEvent>()
  const moveEvents = createEventStream<PointerUIEvent>()
  const upEvents = createEventStream<PointerUIEvent>()
  const cancelEvents = createEventStream<InteractionCancelReason>()

  let phase: DragHandlePhase = "idle"
  let originPointer: Vec2 = { x: 0, y: 0 }
  let lastPointer: Vec2 = { x: 0, y: 0 }

  const gesture = () => ({ origin: originPointer, current: lastPointer })

  pointerDragSession({
    down: downEvents.stream,
    move: moveEvents.stream,
    up: upEvents.stream,
    cancel: cancelEvents.stream,
    thresholdSq,
  }).subscribe((event) => {
    if (event.kind === "start") {
      phase = "dragging"
      lastPointer = { x: event.current.x, y: event.current.y }
      opts.onDragStart?.(gesture())
      return
    }
    if (event.kind === "move") {
      lastPointer = { x: event.current.x, y: event.current.y }
      opts.onDragMove?.(gesture())
      return
    }
    if (event.kind === "end") {
      lastPointer = { x: event.up.x as number, y: event.up.y as number }
      phase = "idle"
      opts.onDragEnd?.(gesture())
      return
    }
    phase = "idle"
    opts.onCancel?.(event.reason, gesture())
  })

  target.on("pointerleave", () => {
    if (!opts.cancelOnLeave) return
    if (phase !== "pressed") return
    cancelEvents.emit("leave")
  })

  target.on("pointerdown", (e: PointerUIEvent) => {
    if (!enabled()) return
    if (e.button !== 0) return
    if (!shouldPress(e)) return
    phase = "pressed"
    originPointer = { x: e.x, y: e.y }
    lastPointer = originPointer
    opts.onPress?.(gesture(), e)
    downEvents.emit(e)
    e.capture()
  })

  target.on("pointermove", (e: PointerUIEvent) => {
    if (phase === "idle") return
    lastPointer = { x: e.x, y: e.y }
    moveEvents.emit(e)
  })

  target.on("pointerup", (e: PointerUIEvent) => {
    if (phase === "idle") return
    const wasDragging = phase === "dragging"
    lastPointer = { x: e.x, y: e.y }
    upEvents.emit(e)
    if (wasDragging) return
    phase = "idle"
    opts.onPressRelease?.(gesture())
  })

  target.on("pointercancel", (payload: { event: PointerUIEvent | null; reason: InteractionCancelReason }) => {
    if (phase === "idle") return
    cancelEvents.emit(payload.reason)
  })

  return {
    state: () => phase,
    pressed: () => phase === "pressed",
    dragging: () => phase === "dragging",
    cancel: (reason) => {
      if (phase === "idle") return
      cancelEvents.emit(reason)
    },
  }
}
