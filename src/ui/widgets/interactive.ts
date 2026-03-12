import { ZERO_RECT, type Rect } from "../../core/rect"
import type { InteractionCancelReason } from "../../core/event_stream"
import { createPressMachine } from "../../core/fsm"
import { PointerUIEvent, UIElement, pointInRect, type DebugEventListenerSnapshot, type Vec2 } from "../base/ui"

/**
 * Shared interactive state mixin for widgets that have hover/down/disabled/active states.
 * Eliminates the identical boilerplate repeated across Button, Checkbox, Radio, etc.
 */
export class InteractiveElement extends UIElement {
  protected readonly _rect: () => Rect
  protected readonly _active: () => boolean
  protected readonly _disabled: () => boolean

  protected hover = false
  private readonly press = createPressMachine()

  constructor(opts: { rect: () => Rect; active?: () => boolean; disabled?: () => boolean }) {
    super()
    this._rect = opts.rect
    this._active = opts.active ?? (() => true)
    this._disabled = opts.disabled ?? (() => false)
  }

  protected interactive() {
    return this._active() && !this._disabled()
  }

  bounds(): Rect {
    if (!this._active()) return ZERO_RECT
    return this._rect()
  }

  protected containsPoint(p: Vec2) {
    return pointInRect(p, this.bounds())
  }

  onPointerEnter() {
    if (!this.interactive()) return
    this.hover = true
  }

  onPointerLeave() {
    this.hover = false
    if (this.press.matches("pressed")) this.press.send({ type: "CANCEL", reason: "leave" })
  }

  onPointerDown(e: PointerUIEvent) {
    if (!this.interactive()) return
    if (e.button !== 0) return
    this.press.send({ type: "PRESS", point: { x: e.x, y: e.y } })
    e.capture()
  }

  onPointerUp(e: PointerUIEvent) {
    if (!this.interactive()) {
      if (this.press.matches("pressed")) this.press.send({ type: "CANCEL", reason: "inactive" })
      return
    }
    if (!this.press.matches("pressed")) return
    this.press.send({ type: "RELEASE", point: { x: e.x, y: e.y } })
    if (!this.hover) return
    this.onActivate()
  }

  onPointerCancel(_e: PointerUIEvent | null, reason: InteractionCancelReason) {
    this.hover = false
    if (!this.press.matches("pressed")) return
    this.press.send({ type: "CANCEL", reason })
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
