import { ZERO_RECT, type Rect } from "../../core/rect"
import { PointerUIEvent, UIElement, pointInRect, type Vec2 } from "../base/ui"

/**
 * Shared interactive state mixin for widgets that have hover/down/disabled/active states.
 * Eliminates the identical boilerplate repeated across Button, Checkbox, Radio, etc.
 */
export class InteractiveElement extends UIElement {
  protected readonly _rect: () => Rect
  protected readonly _active: () => boolean
  protected readonly _disabled: () => boolean

  protected hover = false
  protected down = false

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
    this.down = false
  }

  onPointerDown(e: PointerUIEvent) {
    if (!this.interactive()) return
    if (e.button !== 0) return
    this.down = true
    e.capture()
  }

  onPointerUp(_e: PointerUIEvent) {
    if (!this.interactive()) {
      this.down = false
      return
    }
    if (!this.down) return
    this.down = false
    if (!this.hover) return
    this.onActivate()
  }

  /** Override this to handle the "click" action when the pointer is released over the widget. */
  protected onActivate() {}
}
