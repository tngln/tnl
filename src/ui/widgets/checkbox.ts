import { draw, Line, RRect, Text } from "../../core/draw"
import { font, theme } from "../../config/theme"
import { type Signal } from "../../core/reactivity"
import { toGetter, type Rect } from "../../core/rect"
import { InteractiveElement } from "./interactive"

export class Checkbox extends InteractiveElement {
  private readonly label: () => string
  private readonly checked: Signal<boolean>

  constructor(opts: { rect: () => Rect; label: string | (() => string); checked: Signal<boolean>; active?: () => boolean; disabled?: () => boolean }) {
    super(opts)
    this.label = toGetter(opts.label)
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
      ? "rgba(233,237,243,0.03)"
      : this.down
        ? "rgba(233,237,243,0.10)"
        : this.hover
          ? "rgba(233,237,243,0.08)"
          : "rgba(233,237,243,0.06)"
    const stroke = disabled ? "rgba(255,255,255,0.10)" : theme.colors.windowBorder
    const textColor = disabled ? "rgba(233,237,243,0.38)" : theme.colors.textPrimary

    draw(
      ctx,
      RRect(box, { fill: { color: bg }, stroke: { color: stroke, hairline: true }, pixelSnap: true }),
      Text({
        x: r.x + 24,
        y: r.y,
        text: this.label(),
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
        Line({ x: x0, y: y0 }, { x: x1, y: y1 }, { color: disabled ? "rgba(233,237,243,0.38)" : theme.colors.textPrimary, width: 2.0, lineCap: "round" }),
        Line({ x: x1, y: y1 }, { x: x2, y: y2 }, { color: disabled ? "rgba(233,237,243,0.38)" : theme.colors.textPrimary, width: 2.0, lineCap: "round" }),
      )
    }
  }
}
