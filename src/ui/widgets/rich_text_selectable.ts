import { draw, Rect as RectOp } from "../../core/draw"
import { measureTextWidth, type Any2DContext, type RichTextBlock, type RichTextLayout, type RichTextLine, type RichTextRun } from "../../core/draw.text"
import { ZERO_RECT, type Rect } from "../../core/rect"
import { theme } from "../../config/theme"
import { writeTextToClipboard } from "../../platform/web/clipboard"
import { createMeasureContext } from "../../platform/web/canvas"
import { get1pxTextareaBridge } from "../../platform/web/1px_textarea"
import type { TopLayerController } from "../base/top_layer"
import { KeyUIEvent, PointerUIEvent, UIElement, pointInRect, type Vec2 } from "../base/ui"
import type { MenuItem } from "./menu"
import { MenuStack } from "./menu_stack"

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v))
}

function hasShortcutModifier(e: { ctrlKey: boolean; metaKey: boolean }) {
  return e.ctrlKey || e.metaKey
}

function normalizeSelection(a: number, b: number) {
  const start = Math.min(a, b)
  const end = Math.max(a, b)
  return { start, end }
}

function layoutPlainText(layout: RichTextLayout) {
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

function lineXOffset(layout: RichTextLayout, line: RichTextLine) {
  if (layout.align === "center") return (layout.w - line.w) / 2
  if (layout.align === "end") return layout.w - line.w
  return 0
}

function charOffsetFromX(ctx: Any2DContext, run: RichTextRun, localX: number) {
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

function xForLineOffset(ctx: Any2DContext, line: RichTextLine, offset: number) {
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

function offsetForLineX(ctx: Any2DContext, line: RichTextLine, x: number) {
  const localX = x
  let cursor = 0
  if (!line.runs.length) return 0
  for (const run of line.runs) {
    if (localX < run.x) return cursor
    if (localX <= run.x + run.w) return cursor + charOffsetFromX(ctx, run, localX - run.x)
    cursor += run.text.length
  }
  return cursor
}

export class RichTextSelectable extends UIElement {
  private rect: Rect = ZERO_RECT
  private active = false
  private readonly block: () => RichTextBlock
  private readonly topLayer: TopLayerController
  private readonly sessionId: string
  private readonly measureCtx: Any2DContext | null = createMeasureContext()

  private text = ""
  private lineStartIndex: number[] = []
  private linesText: string[] = []

  private focused = false
  private dragAnchor: number | null = null
  private selectionStart = 0
  private selectionEnd = 0

  private readonly menuId: string
  private readonly stack: MenuStack

  constructor(opts: {
    id: string
    rect: () => Rect
    active: () => boolean
    block: () => RichTextBlock
    topLayer: TopLayerController
  }) {
    super()
    this.block = opts.block
    this.topLayer = opts.topLayer
    this.sessionId = `richtext.${opts.id}`
    this.menuId = `richtext:menu:${opts.id}`
    this.stack = new MenuStack({ id: this.menuId, topLayer: this.topLayer, viewport: () => this.topLayer.host.bounds() })
    this.set({ rect: opts.rect(), active: opts.active() })
  }

  set(next: { rect: Rect; active: boolean }) {
    this.rect = next.rect
    this.active = next.active && next.rect.w > 0 && next.rect.h > 0
  }

  bounds(): Rect {
    if (!this.active) return ZERO_RECT
    return this.rect
  }

  protected containsPoint(p: Vec2) {
    return pointInRect(p, this.bounds())
  }

  canFocus() {
    return this.active
  }

  private syncBridge() {
    if (!this.focused) return
    const b = get1pxTextareaBridge()
    const selection = normalizeSelection(this.selectionStart, this.selectionEnd)
    b.sync(this.sessionId, { value: this.text, selectionStart: selection.start, selectionEnd: selection.end })
  }

  onFocus() {
    if (!this.active) return
    this.focused = true
    const b = get1pxTextareaBridge()
    const selection = normalizeSelection(this.selectionStart, this.selectionEnd)
    b.focus(
      {
        id: this.sessionId,
        onStateChange: (next) => {
          if (next.value !== this.text) return
          this.selectionStart = next.selectionStart
          this.selectionEnd = next.selectionEnd
          this.invalidateSelf({ pad: 8 })
        },
        onBlur: () => {
          if (!this.focused) return
          this.focused = false
          this.dragAnchor = null
          this.invalidateSelf({ pad: 8 })
        },
      },
      { value: this.text, selectionStart: selection.start, selectionEnd: selection.end },
    )
    this.invalidateSelf({ pad: 8 })
  }

  onBlur() {
    this.focused = false
    this.dragAnchor = null
    const collapsed = Math.max(0, Math.min(this.text.length, Math.max(this.selectionStart, this.selectionEnd)))
    this.selectionStart = collapsed
    this.selectionEnd = collapsed
    get1pxTextareaBridge().blur(this.sessionId)
    this.invalidateSelf({ pad: 8 })
  }

  private setSelection(a: number, b: number) {
    const max = this.text.length
    this.selectionStart = clamp(a, 0, max)
    this.selectionEnd = clamp(b, 0, max)
  }

  private indexFromPoint(ctx: Any2DContext, p: Vec2, layout: RichTextLayout) {
    if (!layout.lines.length) return 0
    const lh = layout.lines.length ? layout.h / layout.lines.length : 0
    if (!lh) return 0
    const y = p.y - this.rect.y
    const lineIdx = clamp(Math.floor(y / lh), 0, layout.lines.length - 1)
    const line = layout.lines[lineIdx]!
    const xOff = lineXOffset(layout, line)
    const x = p.x - this.rect.x - xOff
    const offset = offsetForLineX(ctx, line, x)
    const lineStart = this.lineStartIndex[lineIdx] ?? 0
    return clamp(lineStart + offset, 0, this.text.length)
  }

  private selectedText() {
    const s = normalizeSelection(this.selectionStart, this.selectionEnd)
    return this.text.slice(s.start, s.end)
  }

  private syncTextFromLayout(layout: RichTextLayout) {
    const snapshot = layoutPlainText(layout)
    if (snapshot.text === this.text) return
    this.text = snapshot.text
    this.linesText = snapshot.linesText
    this.lineStartIndex = snapshot.lineStartIndex
    this.setSelection(this.selectionStart, this.selectionEnd)
    this.syncBridge()
  }

  private openContextMenu(p: Vec2) {
    const selected = this.selectedText()
    if (!selected) return
    const anchor = { x: p.x, y: p.y, w: 1, h: 1 }
    const items: MenuItem[] = [
      {
        key: "copy",
        text: "Copy",
        onSelect: () => {
          void writeTextToClipboard(selected)
          this.stack.closeAll()
        },
      },
    ]
    this.stack.openRoot(anchor, items, { placement: "bottom-start" })
  }

  onPointerDown(e: PointerUIEvent) {
    if (!this.active) return
    if (e.button === 2) {
      if (this.selectionStart !== this.selectionEnd) {
        this.openContextMenu({ x: e.x, y: e.y })
        e.handle()
        e.stopPropagation()
      }
      return
    }
    if (e.button !== 0) return
    e.requestFocus(this)
    if (!this.measureCtx) return
    const block = this.block()
    block.measure(this.measureCtx, this.rect.w)
    const layout = block.getLayout()
    if (!layout) return
    this.syncTextFromLayout(layout)
    const idx = this.indexFromPoint(this.measureCtx, { x: e.x, y: e.y }, layout)
    this.dragAnchor = idx
    this.setSelection(idx, idx)
    this.syncBridge()
    e.capture()
    this.invalidateSelf({ pad: 8 })
  }

  onPointerMove(e: PointerUIEvent) {
    if (!this.active) return
    if (this.dragAnchor === null || (e.buttons & 1) === 0) return
    if (!this.measureCtx) return
    const block = this.block()
    block.measure(this.measureCtx, this.rect.w)
    const layout = block.getLayout()
    if (!layout) return
    this.syncTextFromLayout(layout)
    const idx = this.indexFromPoint(this.measureCtx, { x: e.x, y: e.y }, layout)
    this.setSelection(this.dragAnchor, idx)
    this.syncBridge()
    this.invalidateSelf({ pad: 8 })
  }

  onPointerUp(e: PointerUIEvent) {
    if (!this.active) return
    if (this.dragAnchor === null) return
    if (!this.measureCtx) return
    const block = this.block()
    block.measure(this.measureCtx, this.rect.w)
    const layout = block.getLayout()
    if (layout) {
      this.syncTextFromLayout(layout)
      const idx = this.indexFromPoint(this.measureCtx, { x: e.x, y: e.y }, layout)
      this.setSelection(this.dragAnchor, idx)
    }
    this.dragAnchor = null
    this.syncBridge()
    this.invalidateSelf({ pad: 8 })
  }

  onPointerCancel() {
    this.dragAnchor = null
  }

  onKeyDown(e: KeyUIEvent) {
    if (!this.focused || !this.active) return
    if (hasShortcutModifier(e) && e.code === "KeyA") {
      this.setSelection(0, this.text.length)
      this.syncBridge()
      e.consume()
      return
    }
    if (hasShortcutModifier(e) && e.code === "KeyC") {
      e.consume()
      return
    }
  }

  protected onDraw(ctx: CanvasRenderingContext2D) {
    if (!this.active) return
    const r = this.rect
    if (r.w <= 0 || r.h <= 0) return
    const block = this.block()
    block.measure(ctx, r.w)
    const layout = block.getLayout()
    if (!layout) return
    this.syncTextFromLayout(layout)

    if (this.selectionStart !== this.selectionEnd) {
      const s = normalizeSelection(this.selectionStart, this.selectionEnd)
      const lh = layout.lines.length ? layout.h / layout.lines.length : 0
      for (let i = 0; i < layout.lines.length; i++) {
        const line = layout.lines[i]!
        const lineText = this.linesText[i] ?? ""
        const start = this.lineStartIndex[i] ?? 0
        const end = start + lineText.length
        const has = s.end > start && s.start < end
        if (!has) continue
        const startOff = clamp(s.start - start, 0, lineText.length)
        const endOff = clamp(s.end - start, 0, lineText.length)
        if (startOff === endOff) continue
        const x0 = xForLineOffset(ctx, line, startOff)
        const x1 = xForLineOffset(ctx, line, endOff)
        const xOff = lineXOffset(layout, line)
        const selX = r.x + xOff + Math.min(x0, x1)
        const selW = Math.abs(x1 - x0)
        draw(ctx, RectOp({ x: selX, y: r.y + i * lh, w: selW, h: lh }, { fill: { color: theme.colors.inputSelectionBg } }))
      }
    }

    block.draw(ctx, { x: r.x, y: r.y })
  }
}
