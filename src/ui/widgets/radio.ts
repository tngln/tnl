import { font, theme } from "@/config/theme"
import { draw, CircleOp, TextOp } from "@/core/draw"
import { signal, type Signal } from "@/core/reactivity"
import { type Rect, ZERO_RECT } from "@/core/rect"
import type { WidgetDescriptor } from "@/ui/builder/widget_registry"
import { InteractiveElement } from "./interactive"

export class Radio extends InteractiveElement {
  private labelValue: string = ""
  private value: string = ""
  private selected: Signal<string>

  constructor(opts: { rect: () => Rect; label: string | (() => string); value: string; selected: Signal<string>; active?: () => boolean; disabled?: () => boolean }) {
    super(opts)
    this.selected = opts.selected
    this.update(opts)
  }

  update(opts: { label: string | (() => string); value: string; selected: Signal<string> }) {
    this.labelValue = typeof opts.label === "function" ? opts.label() : opts.label
    this.value = opts.value
    this.selected = opts.selected
  }

  protected onActivate() {
    this.selected.set(this.value)
  }

  protected onDraw(ctx: CanvasRenderingContext2D) {
    if (!this._active()) return
    const r = this._rect()
    const cx = r.x + 8
    const cy = r.y + 10
    const disabled = this._disabled()
    const stroke = disabled
      ? theme.colors.disabled
      : this.pressed()
        ? theme.colors.pressed
        : this.hover
          ? theme.colors.hover
          : theme.colors.active

    draw(ctx, CircleOp({ x: cx, y: cy, r: 8 }, { stroke: { color: stroke, hairline: true } }))

    if (this.selected.peek() === this.value) {
      draw(ctx, CircleOp({ x: cx, y: cy, r: 4 }, { fill: { paint: disabled ? theme.colors.textMuted : theme.colors.text } }))
    }

    draw(
      ctx,
      TextOp({
        x: r.x + 24,
        y: r.y,
        text: this.labelValue,
        style: { color: disabled ? theme.colors.textMuted : theme.colors.text, font: font(theme, theme.typography.body), baseline: "top" },
      }),
    )
  }
}

type RadioState = {
  widget: Radio
  rect: Rect
  active: boolean
  disabled: boolean
}

export const radioDescriptor: WidgetDescriptor<RadioState, { label: string; value: string; selected: Signal<string>; disabled?: boolean }> = {
  id: "radio",
  create: () => {
    const state = { rect: ZERO_RECT, active: false, disabled: false } as RadioState
    state.widget = new Radio({
      rect: () => state.rect,
      label: "",
      value: "",
      selected: signal(""),
      active: () => state.active,
      disabled: () => state.disabled,
    })
    return state
  },
  getWidget: (state) => state.widget,
  mount: (state, props, rect, active) => {
    state.rect = rect
    state.active = active
    state.disabled = props.disabled ?? false
    state.widget.update({
      label: props.label,
      value: props.value,
      selected: props.selected,
    })
  },
}
