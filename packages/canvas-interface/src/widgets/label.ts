import { toGetter, type Rect } from "../draw"
import { drawSingleLineText } from "../text/single_line"
import { font, theme } from "../theme"
import { UIElement } from "../ui_base"

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
    this.setBounds(this.rect, this.active)
  }

  protected onDraw(ctx: CanvasRenderingContext2D) {
    if (!this.active()) return
    const r = this.rect()
    drawSingleLineText(ctx, {
      x: r.x,
      y: r.y,
      text: this.text(),
      color: this.color(),
      font: font(theme, theme.typography.body),
      baseline: "top",
      overflow: "visible",
    })
  }
}
