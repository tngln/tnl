import type { Rect } from "../draw"
import type { InteractionCancelReason } from "../event_stream"
import { UIElement, type DebugEventListenerSnapshot } from "../ui_base"
import { usePress, type PressBinding } from "../use/use_press"

/**
 * Shared interactive state mixin for widgets that have hover/down/disabled/active states.
 * Eliminates the identical boilerplate repeated across Button, Checkbox, Radio, etc.
 */
export class InteractiveElement extends UIElement {
  protected readonly _rect: () => Rect
  protected readonly _active: () => boolean
  protected readonly _disabled: () => boolean

  private readonly press: PressBinding

  constructor(opts: { rect: () => Rect; active?: () => boolean; disabled?: () => boolean }) {
    super()
    this._rect = opts.rect
    this._active = opts.active ?? (() => true)
    this._disabled = opts.disabled ?? (() => false)
    this.setBounds(this._rect, this._active)
    this.press = usePress(this, {
      enabled: () => this._active() && !this._disabled(),
      onActivate: () => this.onActivate(),
    })
    this.on("pointerenter", () => {
      this.invalidateSelf({ pad: 2 })
    })
    this.on("pointerleave", () => {
      this.invalidateSelf({ pad: 2 })
    })
    this.on("pointerdown", () => {
      this.invalidateSelf({ pad: 2 })
    })
    this.on("pointerup", () => {
      this.invalidateSelf({ pad: 2 })
    })
    this.on("pointercancel", () => {
      this.invalidateSelf({ pad: 2 })
    })
  }

  protected interactive() {
    return this._active() && !this._disabled()
  }

  protected pressed() {
    return this.press.pressed()
  }

  /** Override this to handle the "click" action when the pointer is released over the widget. */
  protected onActivate() {}

  protected debugListeners(): DebugEventListenerSnapshot[] | null {
    return [{ id: "click", label: "Click" }]
  }
}
