import { TextOp, draw, type Rect } from "../draw"
import { truncateToWidth } from "./rich"

export type SingleLineTextOverflow = "visible" | "truncate" | "clip"

export function drawSingleLineText(
  ctx: CanvasRenderingContext2D,
  opts: {
    text: string
    x: number
    y: number
    font: string
    color: string
    align?: CanvasTextAlign
    baseline?: CanvasTextBaseline
    overflow?: SingleLineTextOverflow
    rect?: Rect
    availableWidth?: number
  },
) {
  const overflow = opts.overflow ?? "visible"
  const availableWidth = opts.availableWidth ?? opts.rect?.w
  let text = opts.text

  if (overflow === "truncate" && availableWidth !== undefined) {
    ctx.save()
    ctx.font = opts.font
    text = truncateToWidth(ctx, text, availableWidth)
    ctx.restore()
  }

  const op = TextOp({
    x: opts.x,
    y: opts.y,
    text,
    style: {
      color: opts.color,
      font: opts.font,
      align: opts.align,
      baseline: opts.baseline,
    },
  })

  if (overflow === "clip" && opts.rect) {
    ctx.save()
    ctx.beginPath()
    ctx.rect(opts.rect.x, opts.rect.y, opts.rect.w, opts.rect.h)
    ctx.clip()
    draw(ctx, op)
    ctx.restore()
    return
  }

  draw(ctx, op)
}
