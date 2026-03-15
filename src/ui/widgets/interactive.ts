import type { Rect } from "@/core/rect"
import type { InteractionCancelReason } from "@/core/event_stream"
import { createPressMachine } from "@/core/fsm"
import { PointerUIEvent, UIElement, type DebugEventListenerSnapshot } from "@/ui/base/ui"

/**
 * Shared interactive state mixin for widgets that have hover/down/disabled/active states.
 * Eliminates the identical boilerplate repeated across Button, Checkbox, Radio, etc.
 */
export class InteractiveElement extends UIElement {
  protected readonly _rect: () => Rect
  protected readonly _active: () => boolean
  protected readonly _disabled: () => boolean

  private readonly press = createPressMachine()

  constructor(opts: { rect: () => Rect; active?: () => boolean; disabled?: () => boolean }) {
    super()
    this._rect = opts.rect
    this._active = opts.active ?? (() => true)
    this._disabled = opts.disabled ?? (() => false)
    this.setBounds(this._rect, this._active)
    this.setupInteractiveHandlers()
  }

  protected interactive() {
    return this._active() && !this._disabled()
  }

  protected setupInteractiveHandlers() {
    this.on("pointerleave", () => {
      if (this.press.matches("pressed")) this.press.send({ type: "CANCEL", reason: "leave" })
    })

    this.on("pointerdown", (e: PointerUIEvent) => {
      if (!this.interactive()) return
      if (e.button !== 0) return
      this.press.send({ type: "PRESS", point: { x: e.x, y: e.y } })
      e.capture()
    })

    this.on("pointerup", (e: PointerUIEvent) => {
      if (!this.interactive()) {
        if (this.press.matches("pressed")) this.press.send({ type: "CANCEL", reason: "inactive" })
        return
      }
      if (!this.press.matches("pressed")) return
      this.press.send({ type: "RELEASE", point: { x: e.x, y: e.y } })
      if (!this.hover) return
      this.onActivate()
    })

    this.on("pointercancel", (payload: { event: PointerUIEvent | null; reason: InteractionCancelReason }) => {
      if (!this.press.matches("pressed")) return
      this.press.send({ type: "CANCEL", reason: payload.reason })
    })
  }

  protected pressed() {
    return this.press.matches("pressed")
  }

  /** Override this to handle the "click" action when the pointer is released over the widget. */
  protected onActivate() {}

  protected debugListeners(): DebugEventListenerSnapshot[] | null {
    return [{ id: "click", label: "Click" }]
  }
}
