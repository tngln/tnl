import { createRichTextBlock, type RichTextSpan, type RichTextStyle, type Rect } from "../draw"
import { UIElement } from "../ui/ui_base"

export class Paragraph extends UIElement {
  private readonly rect: () => Rect
  private readonly block: ReturnType<typeof createRichTextBlock>
  private readonly active: () => boolean

  constructor(opts: { rect: () => Rect; spans: RichTextSpan[]; style: RichTextStyle; active?: () => boolean }) {
    super()
    this.rect = opts.rect
    this.block = createRichTextBlock(opts.spans, opts.style, { align: "start" })
    this.active = opts.active ?? (() => true)
    this.setBounds(this.rect, this.active)
  }

  protected onDraw(ctx: CanvasRenderingContext2D) {
    if (!this.active()) return
    const r = this.rect()
    this.block.measure(ctx, r.w)
    this.block.draw(ctx, { x: r.x, y: r.y })
  }
}
