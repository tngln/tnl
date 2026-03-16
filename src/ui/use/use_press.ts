import type { InteractionCancelReason } from "@/core/event_stream"
import { createPressMachine } from "@/core/fsm"
import { PointerUIEvent, UIElement } from "@/ui/base/ui"

export type PressBinding = {
  pressed: () => boolean
  cancel: (reason: InteractionCancelReason) => void
}

export function usePress(
  target: UIElement,
  opts: {
    enabled?: () => boolean
    onActivate?: () => void
    onActivateEvent?: (e: PointerUIEvent) => void
  } = {},
): PressBinding {
  const enabled = opts.enabled ?? (() => true)
  const onActivate = opts.onActivate
  const onActivateEvent = opts.onActivateEvent
  const press = createPressMachine()

  target.on("pointerleave", () => {
    if (press.matches("pressed")) press.send({ type: "CANCEL", reason: "leave" })
  })

  target.on("pointerdown", (e: PointerUIEvent) => {
    if (!enabled()) return
    if (e.button !== 0) return
    press.send({ type: "PRESS", point: { x: e.x, y: e.y } })
    e.capture()
  })

  target.on("pointerup", (e: PointerUIEvent) => {
    if (!enabled()) {
      if (press.matches("pressed")) press.send({ type: "CANCEL", reason: "inactive" })
      return
    }
    if (!press.matches("pressed")) return
    press.send({ type: "RELEASE", point: { x: e.x, y: e.y } })
    if (!target.hover) return
    onActivateEvent?.(e)
    onActivate?.()
  })

  target.on("pointercancel", (payload: { event: PointerUIEvent | null; reason: InteractionCancelReason }) => {
    if (!press.matches("pressed")) return
    press.send({ type: "CANCEL", reason: payload.reason })
  })

  return {
    pressed: () => press.matches("pressed"),
    cancel: (reason) => {
      if (!press.matches("pressed")) return
      press.send({ type: "CANCEL", reason })
    },
  }
}