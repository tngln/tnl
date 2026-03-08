import { createRichTextBlock, type RichTextSpan, type RichTextStyle } from "../../core/draw.text"
import { ZERO_RECT, type Rect } from "../../core/rect"
import { UIElement } from "../base/ui"

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
    if (!this.active()) return ZERO_RECT
    return this.rect()
  }

  protected onDraw(ctx: CanvasRenderingContext2D) {
    if (!this.active()) return
    const r = this.rect()
    this.block.measure(ctx, r.w)
    this.block.draw(ctx, { x: r.x, y: r.y })
  }
}
