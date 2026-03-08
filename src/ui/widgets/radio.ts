import { draw, Circle, Text } from "../../core/draw"
import { font, theme } from "../../config/theme"
import { type Signal } from "../../core/reactivity"
import { toGetter, type Rect } from "../../core/rect"
import { InteractiveElement } from "./interactive"

export class Radio extends InteractiveElement {
  private readonly label: () => string
  private readonly value: string
  private readonly selected: Signal<string>

  constructor(opts: { rect: () => Rect; label: string | (() => string); value: string; selected: Signal<string>; active?: () => boolean; disabled?: () => boolean }) {
    super(opts)
    this.label = toGetter(opts.label)
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
      ? "rgba(233,237,243,0.12)"
      : this.pressed()
        ? "rgba(233,237,243,0.30)"
        : this.hover
          ? "rgba(233,237,243,0.24)"
          : "rgba(233,237,243,0.20)"

    draw(ctx, Circle({ x: cx, y: cy, r: 8 }, { stroke: { color: stroke, hairline: true } }))

    if (this.selected.peek() === this.value) {
      draw(ctx, Circle({ x: cx, y: cy, r: 4 }, { fill: { color: disabled ? "rgba(233,237,243,0.38)" : theme.colors.textPrimary } }))
    }

    draw(
      ctx,
      Text({
        x: r.x + 24,
        y: r.y,
        text: this.label(),
        style: { color: disabled ? "rgba(233,237,243,0.38)" : theme.colors.textPrimary, font: font(theme, theme.typography.body), baseline: "top" },
      }),
    )
  }
}
