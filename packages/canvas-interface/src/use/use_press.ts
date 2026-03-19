import type { InteractionCancelReason } from "../event_stream"
import { createPressMachine } from "../fsm"
import { PointerUIEvent, UIElement } from "../ui_base"

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
    onStateChange?: (pressed: boolean) => void
  } = {},
): PressBinding {
  const enabled = opts.enabled ?? (() => true)
  const onActivate = opts.onActivate
  const onActivateEvent = opts.onActivateEvent
  const onStateChange = opts.onStateChange
  const press = createPressMachine()
  const syncPressedState = (before: boolean) => {
    const after = press.matches("pressed")
    if (before === after) return
    onStateChange?.(after)
  }

  target.on("pointerleave", () => {
    const before = press.matches("pressed")
    if (before) press.send({ type: "CANCEL", reason: "leave" })
    syncPressedState(before)
  })

  target.on("pointerdown", (e: PointerUIEvent) => {
    if (!enabled()) return
    if (e.button !== 0) return
    const before = press.matches("pressed")
    press.send({ type: "PRESS", point: { x: e.x, y: e.y } })
    syncPressedState(before)
    e.capture()
  })

  target.on("pointerup", (e: PointerUIEvent) => {
    if (!enabled()) {
      const before = press.matches("pressed")
      if (before) press.send({ type: "CANCEL", reason: "inactive" })
      syncPressedState(before)
      return
    }
    if (!press.matches("pressed")) return
    const before = press.matches("pressed")
    press.send({ type: "RELEASE", point: { x: e.x, y: e.y } })
    syncPressedState(before)
    if (!target.hover) return
    onActivateEvent?.(e)
    onActivate?.()
  })

  target.on("pointercancel", (payload: { event: PointerUIEvent | null; reason: InteractionCancelReason }) => {
    const before = press.matches("pressed")
    if (!before) return
    press.send({ type: "CANCEL", reason: payload.reason })
    syncPressedState(before)
  })

  return {
    pressed: () => press.matches("pressed"),
    cancel: (reason) => {
      const before = press.matches("pressed")
      if (!before) return
      press.send({ type: "CANCEL", reason })
      syncPressedState(before)
    },
  }
}
