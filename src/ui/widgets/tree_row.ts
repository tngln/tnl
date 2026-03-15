import { theme } from "@/config/theme"
import { draw, RectOp, TextOp } from "@/core/draw"
import { truncateToWidth } from "@/core/draw.text"
import { createPressMachine } from "@/core/fsm"
import { ZERO_RECT } from "@/core/rect"
import { UIElement, pointInRect, type Rect } from "@/ui/base/ui"
import { chevronDownIcon, chevronRightIcon, iconToShape, type IconDef } from "@/ui/icons"
import type { RowVariant } from "./row"
import type { WidgetDescriptor } from "@/ui/builder/widget_registry"

export const TREE_ROW_HEIGHT = theme.ui.controls.treeRowHeight
export const TREE_ROW_INDENT_STEP = theme.ui.controls.treeRow.indentStep
export const TREE_ROW_DISCLOSURE_SLOT = theme.ui.controls.treeRow.disclosureSlot
const TREE_ROW_DISCLOSURE_GAP = theme.ui.controls.treeRow.disclosureGap
const TREE_ROW_LEFT_PAD = theme.ui.controls.treeRow.leftPad
const TREE_ROW_RIGHT_PAD = theme.ui.controls.treeRow.rightPad

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

export function treeRowDisclosureIcon(expanded: boolean): IconDef {
  return expanded ? chevronDownIcon : chevronRightIcon
}

export class TreeRow extends UIElement {
  private activeValue: boolean = true
  private layout: TreeRowLayout = {
    rect: ZERO_RECT,
    depth: 0,
    expandable: false,
    expanded: false,
    leftText: "",
  }
  private onSelect: (() => void) | undefined
  private onToggle: (() => void) | undefined
  private onDoubleClickHandler: (() => void) | undefined
  private readonly press = createPressMachine()

  constructor() {
    super()
    this.setBounds(
      () => this.layout.rect,
      () => {
        const r = this.layout.rect
        return this.activeValue && r.w > 0 && r.h > 0
      },
    )

    this.on("pointerleave", () => {
      if (this.press.matches("pressed")) this.press.send({ type: "CANCEL", reason: "leave" })
    })
    this.on("pointerdown", (e) => {
      if (e.button !== 0) return
      this.press.send({ type: "PRESS", point: { x: e.x, y: e.y } })
      e.capture()
    })
    this.on("pointerup", (e) => {
      if (!this.press.matches("pressed")) return
      this.press.send({ type: "RELEASE", point: { x: e.x, y: e.y } })
      if (!this.hover) return
      if (this.layout.expandable && pointInRect({ x: e.x, y: e.y }, this.disclosureRect())) {
        this.onToggle?.()
        this.invalidateSelf({ force: true })
        return
      }
      this.onSelect?.()
    })
    this.on("doubleclick", (e) => {
      if (!this.hover) return
      if (e.button !== 0) return
      if (this.layout.expandable && pointInRect({ x: e.x, y: e.y }, this.disclosureRect())) return
      this.onDoubleClickHandler?.()
    })
    this.on("pointercancel", ({ reason }) => {
      if (!this.press.matches("pressed")) return
      this.press.send({ type: "CANCEL", reason })
    })
  }

  set(layout: TreeRowLayout, handlers?: { onSelect?: () => void; onToggle?: () => void; onDoubleClick?: () => void }, active?: boolean) {
    this.layout = layout
    this.onSelect = handlers?.onSelect
    this.onToggle = handlers?.onToggle
    this.onDoubleClickHandler = handlers?.onDoubleClick
    if (active !== undefined) this.activeValue = active
  }

  disclosureRect() {
    const r = this.layout.rect
    const x = r.x + TREE_ROW_LEFT_PAD + Math.max(0, this.layout.depth) * TREE_ROW_INDENT_STEP
    const y = r.y + Math.floor((r.h - TREE_ROW_DISCLOSURE_SLOT) / 2)
    return { x, y, w: TREE_ROW_DISCLOSURE_SLOT, h: TREE_ROW_DISCLOSURE_SLOT }
  }

  protected onDraw(ctx: CanvasRenderingContext2D) {
    const r = this.layout.rect
    if (r.w <= 0 || r.h <= 0) return
    const pressed = this.press.matches("pressed")
    const bg = this.layout.selected
      ? theme.colors.rowSelected
      : this.hover
        ? theme.colors.hover
        : "transparent"
    const resolvedBg = pressed ? theme.colors.pressed : bg
    if (resolvedBg !== "transparent") draw(ctx, RectOp(r, { fill: { paint: resolvedBg } }))

    const isGroup = (this.layout.variant ?? "item") === "group"
    const leftColor = isGroup ? theme.colors.text : theme.colors.textMuted
    const leftFont = `${isGroup ? 600 : 500} ${Math.max(10, theme.typography.body.size - 1)}px ${theme.typography.family}`
    const rightFont = `${400} ${Math.max(10, theme.typography.body.size - 2)}px ${theme.typography.family}`
    const disclosureRect = this.disclosureRect()
    const textX = disclosureRect.x + TREE_ROW_DISCLOSURE_SLOT + TREE_ROW_DISCLOSURE_GAP
    const contentW = Math.max(0, r.w - TREE_ROW_LEFT_PAD - TREE_ROW_RIGHT_PAD)

    if (this.layout.expandable) {
      const pad = 2
      draw(
        ctx,
        iconToShape(
          treeRowDisclosureIcon(this.layout.expanded),
          {
            x: disclosureRect.x + pad,
            y: disclosureRect.y + pad,
            w: Math.max(0, disclosureRect.w - pad * 2),
            h: Math.max(0, disclosureRect.h - pad * 2),
          },
          { paint: theme.colors.textMuted },
        ),
      )
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
    const leftMax = Math.max(0, r.w - (textX - r.x) - TREE_ROW_RIGHT_PAD - (rightText ? rightW + theme.ui.controls.treeRow.rightTextGap : 0))
    const leftText = truncateToWidth(ctx, this.layout.leftText, leftMax)
    ctx.restore()

    draw(
      ctx,
      TextOp({
        x: textX,
        y: r.y + r.h / 2 + 0.5,
        text: leftText,
        style: { color: leftColor, font: leftFont, baseline: "middle" },
      }),
    )

    if (rightText) {
      draw(
        ctx,
        TextOp({
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

}

type TreeRowState = {
  widget: TreeRow
  rect: Rect
  active: boolean
  layout: TreeRowLayout
  onSelect?: () => void
  onToggle?: () => void
  onDoubleClick?: () => void
}

export const treeRowDescriptor: WidgetDescriptor<TreeRowState, {
  depth: number
  expandable: boolean
  expanded: boolean
  leftText: string
  rightText?: string
  variant?: RowVariant
  selected?: boolean
  onSelect?: () => void
  onToggle?: () => void
  onDoubleClick?: () => void
}> = {
  id: "treeRow",
  initialZIndex: 10,
  create: () => {
    const state = {
      rect: ZERO_RECT,
      active: false,
      layout: {
        rect: ZERO_RECT,
        depth: 0,
        expandable: false,
        expanded: false,
        leftText: "",
      },
    } as TreeRowState
    state.widget = new TreeRow()
    return state
  },
  getWidget: (state) => state.widget,
  mount: (state, props, rect, active) => {
    state.rect = rect
    state.active = active
    state.onSelect = props.onSelect
    state.onToggle = props.onToggle
    state.onDoubleClick = props.onDoubleClick
    state.layout = {
      rect: active ? rect : ZERO_RECT,
      depth: active ? props.depth : 0,
      expandable: active ? props.expandable : false,
      expanded: active ? props.expanded : false,
      leftText: active ? props.leftText : "",
      rightText: active ? props.rightText : undefined,
      variant: active ? props.variant : undefined,
      selected: active ? props.selected : undefined,
    }
    state.widget.set(state.layout, active ? { onSelect: state.onSelect, onToggle: state.onToggle, onDoubleClick: state.onDoubleClick } : undefined, active)
  },
  unmount: (state) => {
    state.active = false
    state.widget.set(state.layout, undefined, false)
  },
}
