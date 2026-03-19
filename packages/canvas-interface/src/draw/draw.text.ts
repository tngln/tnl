import { draw, LineOp } from "../draw"

export type Any2DContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

export type TextEmphasis = { bold?: boolean; italic?: boolean; underline?: boolean }

export type RichTextSpan = { text: string; color?: string; emphasis?: TextEmphasis }

export type RichTextStyle = { fontFamily: string; fontSize: number; fontWeight?: number; lineHeight: number; color?: string }

export type RichTextLayoutOptions = {
  maxWidth: number
  wrap?: "word"
  align?: "start" | "center" | "end"
}

export type RichTextRun = {
  text: string
  x: number
  w: number
  spanIndex: number
  font: string
  color: string
  underline?: boolean
}

export type RichTextLine = { y: number; w: number; runs: RichTextRun[] }

export type RichTextLayout = { lines: RichTextLine[]; w: number; h: number; align: "start" | "center" | "end" }

type FontMetrics = { ascent: number; descent: number }

class LruCache<K, V> {
  private readonly maxEntries: number
  private readonly map = new Map<K, V>()

  constructor(maxEntries: number) {
    this.maxEntries = Math.max(1, Math.floor(maxEntries))
  }

  get size() {
    return this.map.size
  }

  get(key: K) {
    const v = this.map.get(key)
    if (v === undefined) return undefined
    this.map.delete(key)
    this.map.set(key, v)
    return v
  }

  set(key: K, value: V) {
    if (this.map.has(key)) this.map.delete(key)
    this.map.set(key, value)
    while (this.map.size > this.maxEntries) {
      const first = this.map.keys().next().value as K | undefined
      if (first === undefined) break
      this.map.delete(first)
    }
  }
}

let measureCache = new LruCache<string, number>(5000)
let metricsCache = new LruCache<string, FontMetrics>(512)
let wordSeg: Intl.Segmenter | null = null
let graphemeSeg: Intl.Segmenter | null = null

export function configureTextCache(opts: { measureMaxEntries?: number; metricsMaxEntries?: number } = {}) {
  if (opts.measureMaxEntries !== undefined) measureCache = new LruCache<string, number>(opts.measureMaxEntries)
  if (opts.metricsMaxEntries !== undefined) metricsCache = new LruCache<string, FontMetrics>(opts.metricsMaxEntries)
}

export function fontString(base: RichTextStyle, emphasis?: TextEmphasis) {
  const weight = emphasis?.bold ? 700 : (base.fontWeight ?? 400)
  const italic = emphasis?.italic ? "italic " : ""
  return `${italic}${weight} ${base.fontSize}px ${base.fontFamily}`
}

export function segmentWords(text: string) {
  if (!text) return []
  if (!wordSeg && typeof Intl !== "undefined" && "Segmenter" in Intl) wordSeg = new Intl.Segmenter(undefined, { granularity: "word" })
  if (!wordSeg) return splitWithWhitespace(text)
  const out: string[] = []
  for (const s of wordSeg.segment(text) as any) out.push(s.segment)
  return out.length ? out : splitWithWhitespace(text)
}

function segmentGraphemes(text: string) {
  if (!text) return []
  if (!graphemeSeg && typeof Intl !== "undefined" && "Segmenter" in Intl) graphemeSeg = new Intl.Segmenter(undefined, { granularity: "grapheme" })
  if (!graphemeSeg) return Array.from(text)
  const out: string[] = []
  for (const s of graphemeSeg.segment(text) as any) out.push(s.segment)
  return out.length ? out : Array.from(text)
}

function splitWithWhitespace(text: string) {
  const parts = text.split(/(\s+)/g).filter((p) => p.length > 0)
  return parts.length ? parts : [text]
}

function isWhitespaceToken(t: string) {
  return /^\s+$/.test(t)
}

function normalizeSpace(t: string) {
  return isWhitespaceToken(t) ? " " : t
}

function measureUncached(ctx: Any2DContext, text: string, font: string) {
  const prev = ctx.font
  ctx.font = font
  const w = ctx.measureText(text).width
  ctx.font = prev
  return w
}

export function measureTextWidth(ctx: Any2DContext, text: string, font: string) {
  const key = `${font}\n${text}`
  const hit = measureCache.get(key)
  if (hit !== undefined) return hit
  const w = measureUncached(ctx, text, font)
  measureCache.set(key, w)
  return w
}

export function measureTextLine(ctx: Any2DContext, text: string, font: string, lineHeight: number) {
  const w = measureTextWidth(ctx, text, font)
  return { w, h: lineHeight }
}

export function truncateToWidth(ctx: Any2DContext, text: string, maxWidth: number) {
  if (maxWidth <= 0) return ""
  if (ctx.measureText(text).width <= maxWidth) return text
  const ellipsis = "..."
  const ellipsisW = ctx.measureText(ellipsis).width
  if (ellipsisW >= maxWidth) return ""
  let low = 0
  let high = text.length
  while (low < high) {
    const mid = Math.ceil((low + high) / 2)
    const candidate = text.slice(0, mid) + ellipsis
    if (ctx.measureText(candidate).width <= maxWidth) low = mid
    else high = mid - 1
  }
  return text.slice(0, low) + ellipsis
}

function fontMetrics(ctx: Any2DContext, font: string): FontMetrics {
  const hit = metricsCache.get(font)
  if (hit) return hit
  const prevFont = ctx.font
  const prevBase = ctx.textBaseline
  ctx.font = font
  ctx.textBaseline = "alphabetic"
  const m = ctx.measureText("Mg")
  const ascent = Math.max(0, (m as any).actualBoundingBoxAscent ?? 0)
  const descent = Math.max(0, (m as any).actualBoundingBoxDescent ?? 0)
  ctx.font = prevFont
  ctx.textBaseline = prevBase
  const out = {
    ascent: ascent || 0.8 * (parseFloat(font.split(" ").find((p) => p.endsWith("px"))?.slice(0, -2) ?? "12") || 12),
    descent: descent || 0.2 * (parseFloat(font.split(" ").find((p) => p.endsWith("px"))?.slice(0, -2) ?? "12") || 12),
  }
  metricsCache.set(font, out)
  return out
}

type Token = { text: string; spanIndex: number; font: string; color: string; underline?: boolean; isSpace: boolean }

function tokenize(ctx: Any2DContext, spans: RichTextSpan[], base: RichTextStyle) {
  const tokens: Token[] = []
  for (let i = 0; i < spans.length; i++) {
    const span = spans[i]
    const font = fontString(base, span.emphasis)
    const underline = span.emphasis?.underline
    const segs = segmentWords(span.text)
    for (const raw of segs) {
      const t = normalizeSpace(raw)
      if (!t) continue
      tokens.push({ text: t, spanIndex: i, font, color: span.color ?? base.color ?? "#000", underline, isSpace: t === " " })
    }
  }
  return tokens
}

function pushRun(line: RichTextLine, run: RichTextRun) {
  line.runs.push(run)
  line.w = Math.max(line.w, run.x + run.w)
}

function newLine(y: number): RichTextLine {
  return { y, w: 0, runs: [] }
}

export function layoutRichText(
  ctx: Any2DContext,
  spans: RichTextSpan[],
  base: RichTextStyle,
  opts: RichTextLayoutOptions,
): RichTextLayout {
  const maxWidth = Math.max(0, opts.maxWidth)
  const align = opts.align ?? "start"
  const lh = Math.max(0, base.lineHeight)

  const tokens = tokenize(ctx, spans, base)
  const lines: RichTextLine[] = [newLine(0)]
  let line = lines[0]
  let cursor = 0
  let prevSpace = false

  function nextLine() {
    cursor = 0
    prevSpace = false
    line = newLine(lines.length * lh)
    lines.push(line)
  }

  function placeToken(tok: Token) {
    if (tok.isSpace) {
      if (cursor <= 0) return
      if (prevSpace) return
    }
    const w = measureTextWidth(ctx, tok.text, tok.font)
    if (cursor > 0 && cursor + w > maxWidth && !tok.isSpace) nextLine()
    if (cursor === 0 && tok.isSpace) return
    const run: RichTextRun = {
      text: tok.text,
      x: cursor,
      w,
      spanIndex: tok.spanIndex,
      font: tok.font,
      color: tok.color,
      underline: tok.underline,
    }
    pushRun(line, run)
    cursor += w
    prevSpace = tok.isSpace
  }

  function placeLongToken(tok: Token) {
    const parts = segmentGraphemes(tok.text)
    for (const p of parts) {
      const part = { ...tok, text: p, isSpace: p === " " }
      if (part.isSpace && cursor === 0) continue
      const w = measureTextWidth(ctx, part.text, part.font)
      if (cursor > 0 && cursor + w > maxWidth) nextLine()
      const run: RichTextRun = {
        text: part.text,
        x: cursor,
        w,
        spanIndex: part.spanIndex,
        font: part.font,
        color: part.color,
        underline: part.underline,
      }
      pushRun(line, run)
      cursor += w
      prevSpace = part.isSpace
    }
  }

  for (const tok of tokens) {
    const w = tok.isSpace ? 0 : measureTextWidth(ctx, tok.text, tok.font)
    if (!tok.isSpace && w > maxWidth && maxWidth > 0) placeLongToken(tok)
    else placeToken(tok)
  }

  for (const l of lines) {
    while (l.runs.length && l.runs[l.runs.length - 1].text === " ") l.runs.pop()
    l.w = l.runs.reduce((m, r) => Math.max(m, r.x + r.w), 0)
  }

  const h = lines.length * lh
  return { lines, w: maxWidth, h, align }
}

export function drawRichText(
  ctx: CanvasRenderingContext2D,
  origin: { x: number; y: number },
  layout: RichTextLayout,
  base: RichTextStyle,
) {
  const lh = Math.max(0, base.lineHeight)
  const prevAlign = ctx.textAlign
  const prevBase = ctx.textBaseline
  ctx.textAlign = "start"
  ctx.textBaseline = "alphabetic"

  for (const line of layout.lines) {
    let xOffset = 0
    if (layout.align === "center") xOffset = (layout.w - line.w) / 2
    else if (layout.align === "end") xOffset = layout.w - line.w
    if (!Number.isFinite(xOffset)) xOffset = 0

    for (const run of line.runs) {
      ctx.fillStyle = run.color
      ctx.font = run.font
      const m = fontMetrics(ctx, run.font)
      const x = origin.x + xOffset + run.x
      const yBase = origin.y + line.y + m.ascent
      ctx.fillText(run.text, x, yBase)
      if (run.underline) {
        const uy = yBase + Math.max(1, m.descent * 0.2)
        draw(ctx, LineOp({ x, y: uy }, { x: x + run.w, y: uy }, { color: run.color, hairline: true }))
      }
    }
  }

  ctx.textAlign = prevAlign
  ctx.textBaseline = prevBase
}

export type RichTextBlock = {
  measure: (ctx: Any2DContext, maxWidth: number) => { w: number; h: number }
  draw: (ctx: CanvasRenderingContext2D, origin: { x: number; y: number }) => void
  getLayout: () => RichTextLayout | null
}

export function createRichTextBlock(
  spans: RichTextSpan[],
  base: RichTextStyle,
  opts: Omit<RichTextLayoutOptions, "maxWidth"> = {},
): RichTextBlock {
  let lastMaxWidth = -1
  let lastLayout: RichTextLayout | null = null

  function ensure(ctx: Any2DContext, maxWidth: number) {
    const w = Math.max(0, maxWidth)
    if (lastLayout && lastMaxWidth === w) return lastLayout
    lastMaxWidth = w
    lastLayout = layoutRichText(ctx, spans, base, { ...opts, maxWidth: w })
    return lastLayout
  }

  return {
    measure: (ctx: Any2DContext, maxWidth) => {
      const l = ensure(ctx, maxWidth)
      return { w: maxWidth, h: l.h }
    },
    draw: (ctx: CanvasRenderingContext2D, origin) => {
      const l = ensure(ctx, lastMaxWidth >= 0 ? lastMaxWidth : 0)
      drawRichText(ctx, origin, l, base)
    },
    getLayout: () => lastLayout,
  }
}
