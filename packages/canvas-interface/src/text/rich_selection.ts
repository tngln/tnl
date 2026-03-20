import { clamp } from "../builder/utils"
import { measureTextWidth, type Any2DContext, type RichTextLayout, type RichTextLine, type RichTextRun } from "./rich"

export type RichTextLayoutSnapshot = {
  text: string
  linesText: string[]
  lineStartIndex: number[]
}

export function layoutRichTextPlainText(layout: RichTextLayout): RichTextLayoutSnapshot {
  const linesText: string[] = []
  for (const line of layout.lines) {
    let s = ""
    for (const run of line.runs) s += run.text
    linesText.push(s)
  }
  const lineStartIndex: number[] = []
  let cursor = 0
  for (let i = 0; i < linesText.length; i++) {
    lineStartIndex.push(cursor)
    cursor += linesText[i]!.length
    if (i < linesText.length - 1) cursor += 1
  }
  return {
    text: linesText.join("\n"),
    linesText,
    lineStartIndex,
  }
}

export function richTextLineXOffset(layout: RichTextLayout, line: RichTextLine) {
  if (layout.align === "center") return (layout.w - line.w) / 2
  if (layout.align === "end") return layout.w - line.w
  return 0
}

function richTextCharOffsetFromX(ctx: Any2DContext, run: RichTextRun, localX: number) {
  const x = clamp(localX, 0, run.w)
  if (x <= 0) return 0
  if (x >= run.w) return run.text.length
  let low = 0
  let high = run.text.length
  while (low < high) {
    const mid = Math.ceil((low + high) / 2)
    const w = measureTextWidth(ctx, run.text.slice(0, mid), run.font)
    if (w <= x) low = mid
    else high = mid - 1
  }
  return low
}

export function richTextLineXForOffset(ctx: Any2DContext, line: RichTextLine, offset: number) {
  const off = clamp(offset, 0, line.runs.reduce((s, r) => s + r.text.length, 0))
  let cursor = 0
  for (const run of line.runs) {
    const next = cursor + run.text.length
    if (off <= next) {
      const within = off - cursor
      const w = within <= 0 ? 0 : measureTextWidth(ctx, run.text.slice(0, within), run.font)
      return run.x + w
    }
    cursor = next
  }
  const last = line.runs[line.runs.length - 1]
  return last ? last.x + last.w : 0
}

export function richTextLineOffsetForX(ctx: Any2DContext, line: RichTextLine, x: number) {
  let cursor = 0
  if (!line.runs.length) return 0
  for (const run of line.runs) {
    if (x < run.x) return cursor
    if (x <= run.x + run.w) return cursor + richTextCharOffsetFromX(ctx, run, x - run.x)
    cursor += run.text.length
  }
  return cursor
}

export function richTextLayoutIndexFromPoint(
  ctx: Any2DContext,
  layout: RichTextLayout,
  rect: { x: number; y: number; w: number; h: number },
  point: { x: number; y: number },
  snapshot: RichTextLayoutSnapshot,
) {
  if (!layout.lines.length) return 0
  const lh = layout.lines.length ? layout.h / layout.lines.length : 0
  if (!lh) return 0
  const y = point.y - rect.y
  const lineIdx = clamp(Math.floor(y / lh), 0, layout.lines.length - 1)
  const line = layout.lines[lineIdx]!
  const xOff = richTextLineXOffset(layout, line)
  const localX = point.x - rect.x - xOff
  const offset = richTextLineOffsetForX(ctx, line, localX)
  const lineStart = snapshot.lineStartIndex[lineIdx] ?? 0
  return clamp(lineStart + offset, 0, snapshot.text.length)
}
