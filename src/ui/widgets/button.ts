import { draw, RRect, Text } from "../../core/draw"
import { font, theme } from "../../config/theme"
import { toGetter, type Rect } from "../../core/rect"
import { InteractiveElement } from "./interactive"

export class Button extends InteractiveElement {
  private readonly text: () => string
  private readonly title: () => string
  private readonly onClick: (() => void) | undefined

  constructor(opts: { rect: () => Rect; text: string | (() => string); title?: string | (() => string); onClick?: () => void; active?: () => boolean; disabled?: () => boolean }) {
    super(opts)
    this.text = toGetter(opts.text)
    this.title = opts.title ? toGetter(opts.title) : this.text
    this.onClick = opts.onClick
  }

  protected onActivate() {
    this.onClick?.()
  }

  protected onDraw(ctx: CanvasRenderingContext2D) {
    if (!this._active()) return
    const r = this._rect()
    const disabled = this._disabled()
    const bg = disabled
      ? "rgba(233,237,243,0.03)"
      : this.pressed()
        ? "rgba(233,237,243,0.12)"
        : this.hover
          ? "rgba(233,237,243,0.08)"
          : "rgba(233,237,243,0.06)"
    const stroke = disabled ? "rgba(255,255,255,0.10)" : theme.colors.windowBorder
    const textColor = disabled ? "rgba(233,237,243,0.38)" : theme.colors.textPrimary
    draw(
      ctx,
      RRect(
        { x: r.x, y: r.y, w: r.w, h: r.h, r: theme.radii.sm },
        { fill: { color: bg }, stroke: { color: stroke, hairline: true }, pixelSnap: true },
      ),
      Text({
        x: r.x + r.w / 2,
        y: r.y + r.h / 2 + 0.5,
        text: this.text(),
        style: {
          color: textColor,
          font: font(theme, theme.typography.body),
          align: "center",
          baseline: "middle",
        },
      }),
    )

    const title = this.title().trim()
    if (!title || !this.hover || this.pressed() || title === this.text()) return  // eslint-disable-line @typescript-eslint/prefer-nullish-coalescing
    ctx.save()
    ctx.font = font(theme, theme.typography.body)
    const metrics = ctx.measureText(title)
    ctx.restore()
    const padX = 6
    const padY = 4
    const tipW = Math.ceil(metrics.width + padX * 2)
    const tipH = 20
    const tipX = r.x + Math.max(0, (r.w - tipW) / 2)
    const tipY = Math.max(0, r.y - tipH - 6)
    draw(
      ctx,
      RRect(
        { x: tipX, y: tipY, w: tipW, h: tipH, r: theme.radii.sm },
        { fill: { color: "rgba(11,15,23,0.96)" }, stroke: { color: "rgba(255,255,255,0.12)", hairline: true }, pixelSnap: true },
      ),
      Text({
        x: tipX + tipW / 2,
        y: tipY + tipH / 2 + 0.5,
        text: title,
        style: {
          color: theme.colors.textPrimary,
          font: font(theme, theme.typography.body),
          align: "center",
          baseline: "middle",
        },
      }),
    )
  }
}
