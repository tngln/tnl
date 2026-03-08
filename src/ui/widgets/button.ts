import { draw, RRect, Text } from "../../core/draw"
import { font, theme } from "../../config/theme"
import { PointerUIEvent, UIElement, type Rect } from "../base/ui"

export class Button extends UIElement {
  private readonly rect: () => Rect
  private readonly text: () => string
  private readonly title: () => string
  private readonly onClick: (() => void) | undefined
  private readonly active: () => boolean
  private readonly disabled: () => boolean

  private hover = false
  private down = false

  constructor(opts: { rect: () => Rect; text: string | (() => string); title?: string | (() => string); onClick?: () => void; active?: () => boolean; disabled?: () => boolean }) {
    super()
    this.rect = opts.rect
    if (typeof opts.text === "string") {
      const t = opts.text
      this.text = () => t
    } else {
      this.text = opts.text
    }
    if (!opts.title) {
      this.title = this.text
    } else if (typeof opts.title === "string") {
      const t = opts.title
      this.title = () => t
    } else {
      this.title = opts.title
    }
    this.onClick = opts.onClick
    this.active = opts.active ?? (() => true)
    this.disabled = opts.disabled ?? (() => false)
  }

  private interactive() {
    return this.active() && !this.disabled()
  }

  bounds(): Rect {
    if (!this.active()) return { x: 0, y: 0, w: 0, h: 0 }
    return this.rect()
  }

  protected onDraw(ctx: CanvasRenderingContext2D) {
    if (!this.active()) return
    const r = this.rect()
    const disabled = this.disabled()
    const bg = disabled
      ? "rgba(233,237,243,0.03)"
      : this.down
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
    if (!title || !this.hover || this.down || title === this.text()) return
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
    this.onClick?.()
  }
}
