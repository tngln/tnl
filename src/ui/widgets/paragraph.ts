import { createRichTextBlock, type RichTextSpan, type RichTextStyle } from "../../core/draw.text"
import { UIElement, type Rect } from "../base/ui"

export class Paragraph extends UIElement {
  private readonly rect: () => Rect
  private readonly block: ReturnType<typeof createRichTextBlock>
  private readonly active: () => boolean

  constructor(opts: { rect: () => Rect; spans: RichTextSpan[]; style: RichTextStyle; active?: () => boolean }) {
    super()
    this.rect = opts.rect
    this.block = createRichTextBlock(opts.spans, opts.style, { align: "start", wrap: "word" })
    this.active = opts.active ?? (() => true)
  }

  bounds(): Rect {
    if (!this.active()) return { x: 0, y: 0, w: 0, h: 0 }
    return this.rect()
  }

  protected onDraw(ctx: CanvasRenderingContext2D) {
    if (!this.active()) return
    const r = this.rect()
    this.block.measure(ctx, r.w)
    this.block.draw(ctx, { x: r.x, y: r.y })
  }
}
