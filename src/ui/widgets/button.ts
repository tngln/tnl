import { draw, RRect, Text } from "../../core/draw"
import { font, theme } from "../../config/theme"
import { PointerUIEvent, UIElement, type Rect } from "../base/ui"

function isActive(active: (() => boolean) | undefined) {
  return active ? active() : true
}

export class Button extends UIElement {
  private readonly rect: () => Rect
  private readonly text: () => string
  private readonly onClick: (() => void) | undefined
  private readonly active: (() => boolean) | undefined

  private hover = false
  private down = false

  constructor(opts: { rect: () => Rect; text: string | (() => string); onClick?: () => void; active?: () => boolean }) {
    super()
    this.rect = opts.rect
    if (typeof opts.text === "string") {
      const t = opts.text
      this.text = () => t
    } else {
      this.text = opts.text
    }
    this.onClick = opts.onClick
    this.active = opts.active
  }

  bounds(): Rect {
    if (!isActive(this.active)) return { x: 0, y: 0, w: 0, h: 0 }
    return this.rect()
  }

  protected onDraw(ctx: CanvasRenderingContext2D) {
    if (!isActive(this.active)) return
    const r = this.rect()
    const bg = this.down
      ? "rgba(233,237,243,0.12)"
      : this.hover
        ? "rgba(233,237,243,0.08)"
        : "rgba(233,237,243,0.06)"
    draw(
      ctx,
      RRect(
        { x: r.x, y: r.y, w: r.w, h: r.h, r: theme.radii.sm },
        { fill: { color: bg }, stroke: { color: theme.colors.windowBorder, hairline: true }, pixelSnap: true },
      ),
      Text({
        x: r.x + r.w / 2,
        y: r.y + r.h / 2 + 0.5,
        text: this.text(),
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
    this.hover = true
  }

  onPointerLeave() {
    this.hover = false
    this.down = false
  }

  onPointerDown(e: PointerUIEvent) {
    if (!isActive(this.active)) return
    if (e.button !== 0) return
    this.down = true
    e.capture()
  }

  onPointerUp(_e: PointerUIEvent) {
    if (!this.down) return
    this.down = false
    if (!this.hover) return
    this.onClick?.()
  }
}
