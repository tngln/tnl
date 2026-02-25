import { createRichTextBlock } from "../../core/draw.text"
import { draw, Text } from "../../core/draw"
import { font, theme } from "../../config/theme"
import type { Surface, ViewportContext } from "../base/viewport"

export class TextSurface implements Surface {
  readonly id: string
  private readonly title: string
  private bodyBlock: ReturnType<typeof createRichTextBlock> | null = null
  private readonly body: string

  constructor(opts: { id: string; title: string; body: string }) {
    this.id = opts.id
    this.title = opts.title
    this.body = opts.body
    const lh = theme.spacing.lg
    this.bodyBlock = createRichTextBlock([{ text: this.body, color: theme.colors.textMuted }], { fontFamily: theme.typography.family, fontSize: theme.typography.body.size, fontWeight: theme.typography.body.weight, lineHeight: lh }, { align: "start", wrap: "word" })
  }

  render(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, viewport: ViewportContext) {
    const w = viewport.contentRect.w
    draw(ctx as any, Text({ x: 0, y: 0, text: this.title, style: { color: theme.colors.textPrimary, font: font(theme, theme.typography.headline), baseline: "top" } }))
    const body = this.bodyBlock
    if (!body) return
    const c = ctx as any as CanvasRenderingContext2D
    body.measure(c, Math.max(0, w))
    body.draw(c, { x: 0, y: theme.spacing.lg + theme.spacing.sm })
  }
}
