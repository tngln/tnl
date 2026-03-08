import { draw, Rect as RectOp, Text } from "../../core/draw"
import { theme } from "../../config/theme"
import { PointerUIEvent, UIElement, pointInRect, type Rect } from "../base/ui"

export type RowVariant = "group" | "item"

export type RowLayout = {
  rect: Rect
  indent?: number
  leftText: string
  rightText?: string
  variant?: RowVariant
  selected?: boolean
}

export class Row extends UIElement {
  private layout: RowLayout = { rect: { x: 0, y: 0, w: 0, h: 0 }, leftText: "" }
  private onClick: (() => void) | undefined
  private hover = false
  private down = false

  set(layout: RowLayout, onClick?: () => void) {
    this.layout = layout
    this.onClick = onClick
  }

  bounds(): Rect {
    const r = this.layout.rect
    if (r.w <= 0 || r.h <= 0) return { x: 0, y: 0, w: 0, h: 0 }
    return r
  }

  protected containsPoint(p: { x: number; y: number }) {
    return pointInRect(p, this.bounds())
  }

  protected onDraw(ctx: CanvasRenderingContext2D) {
    const r = this.layout.rect
    if (r.w <= 0 || r.h <= 0) return
    const bg = this.down
      ? "rgba(255,255,255,0.06)"
      : this.layout.selected
        ? "rgba(255,255,255,0.055)"
        : this.hover
          ? "rgba(255,255,255,0.05)"
          : "transparent"
    if (bg !== "transparent") draw(ctx, RectOp(r, { fill: { color: bg } }))

    const indent = Math.max(0, this.layout.indent ?? 0)
    const isGroup = (this.layout.variant ?? "item") === "group"
    const leftColor = isGroup ? theme.colors.textPrimary : theme.colors.textMuted
    const leftFont = `${isGroup ? 600 : 500} ${Math.max(10, theme.typography.body.size - 1)}px ${theme.typography.family}`
    const leftPad = 8

    draw(
      ctx,
      Text({
        x: r.x + leftPad + indent,
        y: r.y + r.h / 2 + 0.5,
        text: this.layout.leftText,
        style: { color: leftColor, font: leftFont, baseline: "middle" },
      }),
    )

    const right = this.layout.rightText
    if (right) {
      const t = right.length > 80 ? right.slice(0, 77) + "..." : right
      draw(
        ctx,
        Text({
          x: r.x + r.w - leftPad,
          y: r.y + r.h / 2 + 0.5,
          text: t,
          style: {
            color: theme.colors.textMuted,
            font: `${400} ${Math.max(10, theme.typography.body.size - 2)}px ${theme.typography.family}`,
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
    this.down = false
  }

  onPointerDown(e: PointerUIEvent) {
    if (e.button !== 0) return
    this.down = true
    e.capture()
  }

  onPointerUp(_e: PointerUIEvent) {
    if (!this.down) return
    this.down = false
    if (!this.hover) return
    this.onClick?.()
  }
}
