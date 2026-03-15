import type { InteractionCancelReason } from "@/core/event_stream"
import type { Vec2 } from "@/core/rect"
import { KeyUIEvent, PointerUIEvent, WheelUIEvent, type PointerDispatchResult, type UIEventTargetNode } from "./ui.events"

function buildEventPath(target: UIEventTargetNode | null) {
  const path: UIEventTargetNode[] = []
  let current = target
  while (current) {
    path.push(current)
    current = current.eventParentTarget()
  }
  return path
}

export function dispatchPointerEvent(
  target: UIEventTargetNode | null,
  event: PointerUIEvent,
  kind: "down" | "move" | "up",
  pointForTarget?: (node: UIEventTargetNode) => Vec2 | undefined,
) {
  if (!target) {
    return {
      target: null,
      captureTarget: null,
      focusTarget: null,
      handled: false,
      propagationStopped: false,
    } satisfies PointerDispatchResult
  }
  const path = buildEventPath(target)
  const originalTarget = path[0]
  for (let i = 0; i < path.length; i++) {
    const current = path[i]
    event.withDispatch(originalTarget, current, i === 0 ? "target" : "bubble", pointForTarget?.(current))
    if (kind === "down") current.onPointerDown?.(event)
    else if (kind === "move") current.onPointerMove?.(event)
    else current.onPointerUp?.(event)
    if (event.propagationStopped) break
  }
  return {
    target: originalTarget,
    captureTarget: event.didCapture ? originalTarget : null,
    focusTarget: event.focusTarget ?? null,
    handled: event.didHandle,
    propagationStopped: event.propagationStopped,
  } satisfies PointerDispatchResult
}

export function dispatchDoubleClickEvent(target: UIEventTargetNode | null, event: PointerUIEvent, pointForTarget?: (node: UIEventTargetNode) => Vec2 | undefined) {
  if (!target) return
  const path = buildEventPath(target)
  const originalTarget = path[0]
  for (let i = 0; i < path.length; i++) {
    const current = path[i]
    event.withDispatch(originalTarget, current, i === 0 ? "target" : "bubble", pointForTarget?.(current))
    current.onDoubleClick?.(event)
    if (event.propagationStopped) break
  }
}

export function dispatchWheelEvent(target: UIEventTargetNode | null, event: WheelUIEvent, pointForTarget?: (node: UIEventTargetNode) => Vec2 | undefined) {
  if (!target) return
  const path = buildEventPath(target)
  const originalTarget = path[0]
  for (let i = 0; i < path.length; i++) {
    const current = path[i]
    event.withDispatch(originalTarget, current, i === 0 ? "target" : "bubble", pointForTarget?.(current))
    current.onWheel?.(event)
    if (event.propagationStopped) break
  }
}

export function dispatchKeyEvent(target: UIEventTargetNode | null, event: KeyUIEvent, kind: "down" | "up") {
  if (!target) return
  const path = buildEventPath(target)
  const originalTarget = path[0]
  for (let i = 0; i < path.length; i++) {
    const current = path[i]
    event.withDispatch(originalTarget, current, i === 0 ? "target" : "bubble")
    if (kind === "down") current.onKeyDown?.(event)
    else current.onKeyUp?.(event)
    if (event.propagationStopped) break
  }
}

export function dispatchPointerCancelEvent(
  target: UIEventTargetNode | null,
  event: PointerUIEvent | null,
  reason: InteractionCancelReason,
  pointForTarget?: (node: UIEventTargetNode) => Vec2 | undefined,
) {
  if (!target) return
  const path = buildEventPath(target)
  const originalTarget = path[0]
  if (event) event.markCancelReason(reason)
  for (let i = 0; i < path.length; i++) {
    const current = path[i]
    if (event) event.withDispatch(originalTarget, current, i === 0 ? "target" : "bubble", pointForTarget?.(current))
    current.onPointerCancel?.(event, reason)
    if (event?.propagationStopped) break
  }
}
