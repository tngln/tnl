import { draw, Rect as RectOp, Text } from "../../core/draw"
import type { InteractionCancelReason } from "../../core/event_stream"
import { createPressMachine } from "../../core/fsm"
import { theme } from "../../config/theme"
import { truncateToWidth } from "../../core/draw.text"
import { PointerUIEvent, UIElement, pointInRect, type Rect } from "../base/ui"
import { ZERO_RECT } from "../../core/rect"
import type { WidgetDescriptor } from "../builder/widget_registry"

export type RowVariant = "group" | "item"

export type ListRowLayout = {
  rect: Rect
  indent?: number
  leftText: string
  rightText?: string
  variant?: RowVariant
  selected?: boolean
}

export class ListRow extends UIElement {
  private layout: ListRowLayout = { rect: { x: 0, y: 0, w: 0, h: 0 }, leftText: "" }
  private onClick: (() => void) | undefined
  private hover = false
  private readonly press = createPressMachine()

  set(layout: ListRowLayout, onClick?: () => void) {
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
    const pressed = this.press.matches("pressed")
    const bg = this.layout.selected
      ? theme.colors.rowSelectedBg
      : this.hover
        ? theme.colors.controlHover
        : "transparent"
    const resolvedBg = pressed ? theme.colors.controlPressed : bg
    if (resolvedBg !== "transparent") draw(ctx, RectOp(r, { fill: { color: resolvedBg } }))

    const indent = Math.max(0, this.layout.indent ?? 0)
    const isGroup = (this.layout.variant ?? "item") === "group"
    const leftColor = isGroup ? theme.colors.textPrimary : theme.colors.textMuted
    const leftFont = `${isGroup ? 600 : 500} ${Math.max(10, theme.typography.body.size - 1)}px ${theme.typography.family}`
    const rightFont = `${400} ${Math.max(10, theme.typography.body.size - 2)}px ${theme.typography.family}`
    const leftPad = theme.ui.controls.rowTextPadX
    const rightPad = theme.ui.controls.rowTextPadX
    const contentW = Math.max(0, r.w - leftPad - rightPad)

    const right = this.layout.rightText
    let rightText = ""
    let rightW = 0
    if (right) {
      ctx.save()
      ctx.font = rightFont
      const rightMax = Math.max(0, Math.min(contentW * 0.45, contentW - indent - 24))
      rightText = truncateToWidth(ctx, right, rightMax)
      rightW = rightText ? ctx.measureText(rightText).width : 0
      ctx.restore()
    }

    ctx.save()
    ctx.font = leftFont
    const leftMax = Math.max(0, contentW - indent - (rightText ? rightW + theme.ui.controls.rowRightTextGap : 0))
    const leftText = truncateToWidth(ctx, this.layout.leftText, leftMax)
    ctx.restore()

    draw(
      ctx,
      Text({
        x: r.x + leftPad + indent,
        y: r.y + r.h / 2 + 0.5,
        text: leftText,
        style: { color: leftColor, font: leftFont, baseline: "middle" },
      }),
    )

    if (rightText) {
      draw(
        ctx,
        Text({
          x: r.x + r.w - rightPad,
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
    this.onClick?.()
  }

  onPointerCancel(_e: PointerUIEvent | null, reason: InteractionCancelReason) {
    this.hover = false
    if (!this.press.matches("pressed")) return
    this.press.send({ type: "CANCEL", reason })
  }
}

type ListRowState = {
  widget: ListRow
  rect: Rect
  active: boolean
  layout: ListRowLayout
  onClick?: () => void
}

export const listRowDescriptor: WidgetDescriptor<ListRowState, {
  leftText: string
  rightText?: string
  indent?: number
  variant?: "group" | "item"
  selected?: boolean
  onClick?: () => void
}> = {
  id: "listRow",
  initialZIndex: 10,
  create: () => {
    const state = {
      rect: ZERO_RECT,
      active: false,
      layout: { rect: ZERO_RECT, leftText: "" },
    } as ListRowState
    state.widget = new ListRow()
    return state
  },
  getWidget: (state) => state.widget,
  mount: (state, props, rect, active) => {
    state.rect = rect
    state.active = active
    state.onClick = props.onClick
    state.layout = {
      rect: active ? rect : ZERO_RECT,
      leftText: active ? props.leftText : "",
      rightText: active ? props.rightText : undefined,
      indent: active ? props.indent : undefined,
      variant: active ? props.variant : undefined,
      selected: active ? props.selected : undefined,
    }
    state.widget.set(state.layout, state.active ? state.onClick : undefined)
  },
}
