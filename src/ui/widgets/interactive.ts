import type { Rect } from "@/core/rect"
import type { InteractionCancelReason } from "@/core/event_stream"
import { UIElement, type DebugEventListenerSnapshot } from "@/ui/base/ui"
import { usePress, type PressBinding } from "@/ui/use/use_press"

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
