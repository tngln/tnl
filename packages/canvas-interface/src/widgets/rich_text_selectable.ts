import { theme } from "../theme"
import { draw, RectOp, measureTextWidth, type Any2DContext, type RichTextBlock, type RichTextLayout, type RichTextLine, type RichTextRun, ZERO_RECT, type Rect, type Vec2 } from "../draw"
import { get1pxTextareaBridge } from "../../../../src/platform/web/1px_textarea"
import { writeTextToClipboard } from "../../../../src/platform/web/clipboard"
import { createMeasureContext } from "../../../../src/platform/web/canvas"
import { UIElement } from "../ui_base"
import type { TopLayerController } from "../top_layer"
import { clamp } from "../builder/utils"
import type { MenuItem } from "./menu"
import { MenuStack } from "./menu_stack"
import type { WidgetDescriptor } from "../builder/widget_registry"

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
  private block: () => RichTextBlock
  private topLayer: TopLayerController | null = null
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
  private stack: MenuStack | null = null

  constructor(opts: {
    id: string
    rect: () => Rect
    active: () => boolean
    block: () => RichTextBlock
    topLayer?: TopLayerController
  }) {
    super()
    this.block = opts.block
    this.sessionId = `richtext.${opts.id}`
    this.menuId = `richtext:menu:${opts.id}`
    if (opts.topLayer) {
      this.topLayer = opts.topLayer
      this.stack = new MenuStack({ id: this.menuId, topLayer: opts.topLayer, viewport: () => opts.topLayer!.host.bounds() })
    }
    this.update({ rect: opts.rect, active: opts.active, block: opts.block, topLayer: opts.topLayer })
    this.setBounds(() => this.rect, () => this.active)

    this.on("focus", () => {
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
    })
    this.on("blur", () => {
      this.focused = false
      this.dragAnchor = null
      const collapsed = Math.max(0, Math.min(this.text.length, Math.max(this.selectionStart, this.selectionEnd)))
      this.selectionStart = collapsed
      this.selectionEnd = collapsed
      get1pxTextareaBridge().blur(this.sessionId)
      this.invalidateSelf({ pad: 8 })
    })
    this.on("pointerdown", (e) => {
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
    })
    this.on("pointermove", (e) => {
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
    })
    this.on("pointerup", (e) => {
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
    })
    this.on("pointercancel", () => {
      this.dragAnchor = null
    })
    this.on("keydown", (e) => {
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
    })
  }

  update(next: { rect: () => Rect; active: () => boolean; block: () => RichTextBlock; topLayer?: TopLayerController }) {
    this.rect = next.rect()
    this.active = next.active() && this.rect.w > 0 && this.rect.h > 0
    this.block = next.block
    if (next.topLayer) {
      this.topLayer = next.topLayer
      if (!this.stack) this.stack = new MenuStack({ id: this.menuId, topLayer: next.topLayer, viewport: () => next.topLayer!.host.bounds() })
    }
  }

  set(next: { rect: Rect; active: boolean }) {
    this.rect = next.rect
    this.active = next.active && next.rect.w > 0 && next.rect.h > 0
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
    if (!this.stack) return
    const selected = this.selectedText()
    if (!selected) return
    const anchor = { x: p.x, y: p.y, w: 1, h: 1 }
    const items: MenuItem[] = [
      {
        key: "copy",
        text: "Copy",
        onSelect: () => {
          void writeTextToClipboard(selected)
          this.stack?.closeAll()
        },
      },
    ]
    this.stack.openRoot(anchor, items, { placement: "bottom-start" })
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
        draw(ctx, RectOp({ x: selX, y: r.y + i * lh, w: selW, h: lh }, { fill: { paint: theme.colors.inputSelection } }))
      }
    }

    block.draw(ctx, { x: r.x, y: r.y })
  }
}

type RichTextSelectableState = {
  widget: RichTextSelectable
  id: string
  rect: Rect
  active: boolean
}

export const richTextSelectableDescriptor: WidgetDescriptor<RichTextSelectableState, { block: RichTextBlock; topLayer: TopLayerController }> = {
  id: "richTextSelectable",
  initialZIndex: 10,
  create: (id) => {
    const emptyBlock = { measure: () => ({ w: 0, h: 0 }), getLayout: () => null, draw: () => {} } as RichTextBlock
    const state = { id, rect: ZERO_RECT, active: false } as RichTextSelectableState
    state.widget = new RichTextSelectable({
      id,
      rect: () => state.rect,
      active: () => state.active,
      block: () => emptyBlock,
    })
    return state
  },
  getWidget: (state) => state.widget,
  mount: (state, props, rect, active) => {
    state.rect = rect
    state.active = active
    state.widget.update({
      rect: () => state.rect,
      active: () => state.active,
      block: () => props.block,
      topLayer: props.topLayer,
    })
  },
}
