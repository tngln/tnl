import { font, theme, neutral } from "@/config/theme"
import { draw, CircleOp, LineOp, RectOp, TextOp } from "@/core/draw"
import { truncateToWidth } from "@/core/draw.text"
import type { Rect } from "@/core/rect"
import type { ControlState } from "./control"

// --- Button ---

export function drawButton(ctx: CanvasRenderingContext2D, r: Rect, props: { text: string; title?: string }, state: ControlState) {
  const { hover, pressed, disabled } = state
  const bg = disabled ? theme.colors.disabled : pressed ? theme.colors.pressed : hover ? theme.colors.hover : "transparent"
  const stroke = disabled ? neutral[400] : theme.colors.border
  const textColor = disabled ? theme.colors.textMuted : theme.colors.text
  draw(
    ctx,
    RectOp({ x: r.x, y: r.y, w: r.w, h: r.h }, { radius: theme.radii.sm, fill: { paint: bg }, stroke: { color: stroke, hairline: true } }),
    TextOp({
      x: r.x + r.w / 2,
      y: r.y + r.h / 2 + 0.5,
      text: props.text,
      style: { color: textColor, font: font(theme, theme.typography.body), align: "center", baseline: "middle" },
    }),
  )

  const title = props.title?.trim()
  if (!title || !hover || pressed || title === props.text) return  // eslint-disable-line @typescript-eslint/prefer-nullish-coalescing
  ctx.save()
  ctx.font = font(theme, theme.typography.body)
  const metrics = ctx.measureText(title)
  ctx.restore()
  const padX = 6
  const tipW = Math.ceil(metrics.width + padX * 2)
  const tipH = 20
  const tipX = r.x + Math.max(0, (r.w - tipW) / 2)
  const tipY = Math.max(0, r.y - tipH - 6)
  draw(
    ctx,
    RectOp({ x: tipX, y: tipY, w: tipW, h: tipH }, { radius: theme.radii.sm, fill: { paint: neutral[900] }, stroke: { color: neutral[400], hairline: true } }),
    TextOp({
      x: tipX + tipW / 2,
      y: tipY + tipH / 2 + 0.5,
      text: title,
      style: { color: theme.colors.text, font: font(theme, theme.typography.body), align: "center", baseline: "middle" },
    }),
  )
}

// --- Checkbox ---

export function drawCheckbox(ctx: CanvasRenderingContext2D, r: Rect, props: { label: string; checked: boolean }, state: ControlState) {
  const { hover, pressed, disabled } = state
  const box = { x: r.x, y: r.y + 2, w: 16, h: 16 }
  const bg = disabled ? theme.colors.disabled : pressed ? theme.colors.pressed : hover ? theme.colors.hover : "transparent"
  const stroke = disabled ? neutral[400] : theme.colors.border
  const textColor = disabled ? theme.colors.textMuted : theme.colors.text
  draw(
    ctx,
    RectOp({ x: box.x, y: box.y, w: box.w, h: box.h }, { radius: 4, fill: { paint: bg }, stroke: { color: stroke, hairline: true } }),
    TextOp({ x: r.x + 24, y: r.y, text: props.label, style: { color: textColor, font: font(theme, theme.typography.body), baseline: "top" } }),
  )
  if (props.checked) {
    const x0 = box.x + 4, y0 = box.y + 8
    const x1 = box.x + 7, y1 = box.y + 11
    const x2 = box.x + 13, y2 = box.y + 5
    draw(
      ctx,
      LineOp({ x: x0, y: y0 }, { x: x1, y: y1 }, { color: textColor, width: 2.0, lineCap: "round" }),
      LineOp({ x: x1, y: y1 }, { x: x2, y: y2 }, { color: textColor, width: 2.0, lineCap: "round" }),
    )
  }
}

// --- Radio ---

export function drawRadio(ctx: CanvasRenderingContext2D, r: Rect, props: { label: string; value: string; selected: string }, state: ControlState) {
  const { hover, pressed, disabled } = state
  const cx = r.x + 8
  const cy = r.y + 10
  const stroke = disabled ? theme.colors.disabled : pressed ? theme.colors.pressed : hover ? theme.colors.hover : theme.colors.active
  draw(ctx, CircleOp({ x: cx, y: cy, r: 8 }, { stroke: { color: stroke, hairline: true } }))
  if (props.selected === props.value) {
    draw(ctx, CircleOp({ x: cx, y: cy, r: 4 }, { fill: { paint: disabled ? theme.colors.textMuted : theme.colors.text } }))
  }
  draw(ctx, TextOp({
    x: r.x + 24,
    y: r.y,
    text: props.label,
    style: { color: disabled ? theme.colors.textMuted : theme.colors.text, font: font(theme, theme.typography.body), baseline: "top" },
  }))
}

// --- List Row ---

export type ListRowDrawProps = {
  leftText: string
  rightText?: string
  indent?: number
  variant?: "group" | "item"
  selected?: boolean
}

export function drawListRow(ctx: CanvasRenderingContext2D, r: Rect, props: ListRowDrawProps, state: ControlState) {
  const { hover, pressed } = state
  const bg = props.selected ? theme.colors.rowSelected : hover ? theme.colors.hover : "transparent"
  const resolvedBg = pressed ? theme.colors.pressed : bg
  if (resolvedBg !== "transparent") draw(ctx, RectOp(r, { fill: { paint: resolvedBg } }))

  const indent = Math.max(0, props.indent ?? 0)
  const isGroup = (props.variant ?? "item") === "group"
  const leftColor = isGroup ? theme.colors.text : theme.colors.textMuted
  const leftFont = `${isGroup ? 600 : 500} ${Math.max(10, theme.typography.body.size - 1)}px ${theme.typography.family}`
  const rightFont = `${400} ${Math.max(10, theme.typography.body.size - 2)}px ${theme.typography.family}`
  const leftPad = theme.ui.controls.rowTextPadX
  const rightPad = theme.ui.controls.rowTextPadX
  const contentW = Math.max(0, r.w - leftPad - rightPad)

  let rightText = ""
  let rightW = 0
  if (props.rightText) {
    ctx.save()
    ctx.font = rightFont
    const rightMax = Math.max(0, Math.min(contentW * 0.45, contentW - indent - 24))
    rightText = truncateToWidth(ctx, props.rightText, rightMax)
    rightW = rightText ? ctx.measureText(rightText).width : 0
    ctx.restore()
  }

  ctx.save()
  ctx.font = leftFont
  const leftMax = Math.max(0, contentW - indent - (rightText ? rightW + theme.ui.controls.rowRightTextGap : 0))
  const leftStr = truncateToWidth(ctx, props.leftText, leftMax)
  ctx.restore()

  draw(ctx, TextOp({ x: r.x + leftPad + indent, y: r.y + r.h / 2 + 0.5, text: leftStr, style: { color: leftColor, font: leftFont, baseline: "middle" } }))
  if (rightText) {
    draw(ctx, TextOp({
      x: r.x + r.w - rightPad,
      y: r.y + r.h / 2 + 0.5,
      text: rightText,
      style: { color: theme.colors.textMuted, font: rightFont, baseline: "middle", align: "end" },
    }))
  }
}
