import { draw, Line, Rect as RectOp, Text } from "../../core/draw"
import type { InteractionCancelReason } from "../../core/event_stream"
import { createPressMachine } from "../../core/fsm"
import { theme } from "../../config/theme"
import { PointerUIEvent, UIElement, pointInRect, type Rect } from "../base/ui"
import type { RowVariant } from "./row"

export const TREE_ROW_HEIGHT = theme.ui.controls.treeRowHeight
export const TREE_ROW_INDENT_STEP = 12
export const TREE_ROW_DISCLOSURE_SLOT = 12
const TREE_ROW_DISCLOSURE_GAP = 4
const TREE_ROW_LEFT_PAD = 8
const TREE_ROW_RIGHT_PAD = 8

export type TreeRowLayout = {
  rect: Rect
  depth: number
  expandable: boolean
  expanded: boolean
  leftText: string
  rightText?: string
  variant?: RowVariant
  selected?: boolean
}

function truncateToWidth(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
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

export class TreeRow extends UIElement {
  private layout: TreeRowLayout = {
    rect: { x: 0, y: 0, w: 0, h: 0 },
    depth: 0,
    expandable: false,
    expanded: false,
    leftText: "",
  }
  private onSelect: (() => void) | undefined
  private onToggle: (() => void) | undefined
  private hover = false
  private readonly press = createPressMachine()

  set(layout: TreeRowLayout, handlers?: { onSelect?: () => void; onToggle?: () => void }) {
    this.layout = layout
    this.onSelect = handlers?.onSelect
    this.onToggle = handlers?.onToggle
  }

  bounds(): Rect {
    const r = this.layout.rect
    if (r.w <= 0 || r.h <= 0) return { x: 0, y: 0, w: 0, h: 0 }
    return r
  }

  disclosureRect() {
    const r = this.layout.rect
    const x = r.x + TREE_ROW_LEFT_PAD + Math.max(0, this.layout.depth) * TREE_ROW_INDENT_STEP
    const y = r.y + Math.floor((r.h - TREE_ROW_DISCLOSURE_SLOT) / 2)
    return { x, y, w: TREE_ROW_DISCLOSURE_SLOT, h: TREE_ROW_DISCLOSURE_SLOT }
  }

  protected containsPoint(p: { x: number; y: number }) {
    return pointInRect(p, this.bounds())
  }

  protected onDraw(ctx: CanvasRenderingContext2D) {
    const r = this.layout.rect
    if (r.w <= 0 || r.h <= 0) return
    const pressed = this.press.matches("pressed")
    const bg = this.layout.selected
      ? "rgba(255,255,255,0.055)"
      : this.hover
        ? "rgba(255,255,255,0.05)"
        : "transparent"
    const resolvedBg = pressed ? "rgba(255,255,255,0.06)" : bg
    if (resolvedBg !== "transparent") draw(ctx, RectOp(r, { fill: { color: resolvedBg } }))

    const isGroup = (this.layout.variant ?? "item") === "group"
    const leftColor = isGroup ? theme.colors.textPrimary : theme.colors.textMuted
    const leftFont = `${isGroup ? 600 : 500} ${Math.max(10, theme.typography.body.size - 1)}px ${theme.typography.family}`
    const rightFont = `${400} ${Math.max(10, theme.typography.body.size - 2)}px ${theme.typography.family}`
    const disclosureRect = this.disclosureRect()
    const textX = disclosureRect.x + TREE_ROW_DISCLOSURE_SLOT + TREE_ROW_DISCLOSURE_GAP
    const contentW = Math.max(0, r.w - TREE_ROW_LEFT_PAD - TREE_ROW_RIGHT_PAD)

    if (this.layout.expandable) {
      const cx = disclosureRect.x + disclosureRect.w / 2
      const cy = disclosureRect.y + disclosureRect.h / 2
      const d = 3.5
      if (this.layout.expanded) {
        draw(
          ctx,
          Line({ x: cx - d, y: cy - 1 }, { x: cx, y: cy + 2 }, { color: theme.colors.textMuted, width: 1.5, lineCap: "round" }),
          Line({ x: cx + d, y: cy - 1 }, { x: cx, y: cy + 2 }, { color: theme.colors.textMuted, width: 1.5, lineCap: "round" }),
        )
      } else {
        draw(
          ctx,
          Line({ x: cx - 1, y: cy - d }, { x: cx + 2, y: cy }, { color: theme.colors.textMuted, width: 1.5, lineCap: "round" }),
          Line({ x: cx - 1, y: cy + d }, { x: cx + 2, y: cy }, { color: theme.colors.textMuted, width: 1.5, lineCap: "round" }),
        )
      }
    }

    const right = this.layout.rightText
    let rightText = ""
    let rightW = 0
    if (right) {
      ctx.save()
      ctx.font = rightFont
      const rightMax = Math.max(0, Math.min(contentW * 0.45, contentW - (textX - r.x) - 24))
      rightText = truncateToWidth(ctx, right, rightMax)
      rightW = rightText ? ctx.measureText(rightText).width : 0
      ctx.restore()
    }

    ctx.save()
    ctx.font = leftFont
    const leftMax = Math.max(0, r.w - (textX - r.x) - TREE_ROW_RIGHT_PAD - (rightText ? rightW + 12 : 0))
    const leftText = truncateToWidth(ctx, this.layout.leftText, leftMax)
    ctx.restore()

    draw(
      ctx,
      Text({
        x: textX,
        y: r.y + r.h / 2 + 0.5,
        text: leftText,
        style: { color: leftColor, font: leftFont, baseline: "middle" },
      }),
    )

    if (rightText) {
      draw(
        ctx,
        Text({
          x: r.x + r.w - TREE_ROW_RIGHT_PAD,
          y: r.y + r.h / 2 + 0.5,
          text: rightText,
          style: {
            color: theme.colors.textMuted,
            font: rightFont,
            baseline: "middle",
            align: "end",
          },
        }),
      )
    }
  }

  onPointerEnter() {
    this.hover = true
  }

  onPointerLeave() {
    this.hover = false
    if (this.press.matches("pressed")) this.press.send({ type: "CANCEL", reason: "leave" })
  }

  onPointerDown(e: PointerUIEvent) {
    if (e.button !== 0) return
    this.press.send({ type: "PRESS", point: { x: e.x, y: e.y } })
    e.capture()
  }

  onPointerUp(e: PointerUIEvent) {
    if (!this.press.matches("pressed")) return
    this.press.send({ type: "RELEASE", point: { x: e.x, y: e.y } })
    if (!this.hover) return
    if (this.layout.expandable && pointInRect({ x: e.x, y: e.y }, this.disclosureRect())) {
      this.onToggle?.()
      return
    }
    this.onSelect?.()
  }

  onPointerCancel(_e: PointerUIEvent | null, reason: InteractionCancelReason) {
    this.hover = false
    if (!this.press.matches("pressed")) return
    this.press.send({ type: "CANCEL", reason })
  }
}
