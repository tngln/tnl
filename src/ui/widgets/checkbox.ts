import { font, theme } from "@/config/theme"
import { draw, LineOp, RectOp, TextOp } from "@/core/draw"
import { signal, type Signal } from "@/core/reactivity"
import { type Rect, ZERO_RECT } from "@/core/rect"
import type { WidgetDescriptor } from "@/ui/builder/widget_registry"
import { InteractiveElement } from "./interactive"

export class Checkbox extends InteractiveElement {
  private labelValue: string = ""
  private checked: Signal<boolean>

  constructor(opts: { rect: () => Rect; label: string | (() => string); checked: Signal<boolean>; active?: () => boolean; disabled?: () => boolean }) {
    super(opts)
    this.checked = opts.checked
    this.update(opts)
  }

  update(opts: { label: string | (() => string); checked: Signal<boolean> }) {
    this.labelValue = typeof opts.label === "function" ? opts.label() : opts.label
    this.checked = opts.checked
  }

  protected onActivate() {
    this.checked.set((v) => !v)
  }

  protected onDraw(ctx: CanvasRenderingContext2D) {
    if (!this._active()) return
    const r = this._rect()
    const box = { x: r.x, y: r.y + 2, w: 16, h: 16, r: 4 }
    const disabled = this._disabled()
    const bg = disabled
      ? theme.colors.controlDisabled
      : this.pressed()
        ? theme.colors.controlPressed
        : this.hover
          ? theme.colors.controlHover
          : "transparent"
    const stroke = disabled ? theme.colors.white10 : theme.colors.windowBorder
    const textColor = disabled ? theme.colors.textMuted : theme.colors.textPrimary

    draw(
      ctx,
      RectOp({ x: box.x, y: box.y, w: box.w, h: box.h }, { radius: box.r, fill: { color: bg }, stroke: { color: stroke, hairline: true } }),
      TextOp({
        x: r.x + 24,
        y: r.y,
        text: this.labelValue,
        style: { color: textColor, font: font(theme, theme.typography.body), baseline: "top" },
      }),
    )

    if (this.checked.peek()) {
      const x0 = box.x + 4
      const y0 = box.y + 8
      const x1 = box.x + 7
      const y1 = box.y + 11
      const x2 = box.x + 13
      const y2 = box.y + 5
      draw(
        ctx,
        LineOp({ x: x0, y: y0 }, { x: x1, y: y1 }, { color: textColor, width: 2.0, lineCap: "round" }),
        LineOp({ x: x1, y: y1 }, { x: x2, y: y2 }, { color: textColor, width: 2.0, lineCap: "round" }),
      )
    }
  }
}

type CheckboxState = {
  widget: Checkbox
  rect: Rect
  active: boolean
  disabled: boolean
}

export const checkboxDescriptor: WidgetDescriptor<CheckboxState, { label: string; checked: Signal<boolean>; disabled?: boolean }> = {
  id: "checkbox",
  create: () => {
    const state = { rect: ZERO_RECT, active: false, disabled: false } as CheckboxState
    state.widget = new Checkbox({
      rect: () => state.rect,
      label: "",
      checked: signal(false),
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
      checked: props.checked,
    })
  },
}
