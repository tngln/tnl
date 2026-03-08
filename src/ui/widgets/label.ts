import { draw, Text } from "../../core/draw"
import { font, theme } from "../../config/theme"
import { UIElement, type Rect } from "../base/ui"

export class Label extends UIElement {
  private readonly rect: () => Rect
  private readonly text: () => string
  private readonly color: () => string
  private readonly active: () => boolean

  constructor(opts: { rect: () => Rect; text: string | (() => string); color?: string | (() => string); active?: () => boolean }) {
    super()
    this.rect = opts.rect
    if (typeof opts.text === "string") {
      const t = opts.text
      this.text = () => t
    } else {
      this.text = opts.text
    }
    if (!opts.color) {
      this.color = () => theme.colors.textMuted
    } else if (typeof opts.color === "string") {
      const c = opts.color
      this.color = () => c
    } else {
      this.color = opts.color
    }
    this.active = opts.active ?? (() => true)
  }

  bounds(): Rect {
    if (!this.active()) return { x: 0, y: 0, w: 0, h: 0 }
    return this.rect()
  }

  protected onDraw(ctx: CanvasRenderingContext2D) {
    if (!this.active()) return
    const r = this.rect()
    draw(
      ctx,
      Text({
        x: r.x,
        y: r.y,
        text: this.text(),
        style: { color: this.color(), font: font(theme, theme.typography.body), baseline: "top" },
      }),
    )
  }
}
