import { draw, Text } from "../../core/draw"
import { font, theme } from "../../config/theme"
import { ZERO_RECT, toGetter, type Rect } from "../../core/rect"
import { UIElement } from "../base/ui"

export class Label extends UIElement {
  private readonly rect: () => Rect
  private readonly text: () => string
  private readonly color: () => string
  private readonly active: () => boolean

  constructor(opts: { rect: () => Rect; text: string | (() => string); color?: string | (() => string); active?: () => boolean }) {
    super()
    this.rect = opts.rect
    this.text = toGetter(opts.text)
    this.color = toGetter(opts.color, theme.colors.textMuted)
    this.active = opts.active ?? (() => true)
  }

  bounds(): Rect {
    if (!this.active()) return ZERO_RECT
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
