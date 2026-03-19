import { theme } from "../theme"
import { ZERO_RECT, type Rect } from "../draw"
import type { RowVariant } from "../builder/types"
import { drawVisualNode, type VisualNode } from "../builder/visual"
import { rowSurface } from "../builder/visual.presets"
import { UIElement, pointInRect } from "../ui_base"
import { chevronDownIcon, chevronRightIcon, type IconDef } from "../icons"
import { usePress, type PressBinding } from "../use/use_press"
import type { WidgetDescriptor } from "../builder/widget_registry"

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

export function buildTreeRowVisual(layout: TreeRowLayout, state: { hover: boolean; pressed: boolean }): VisualNode {
  const disclosureRect = {
    kind: "box" as const,
    style: {
      base: {
        layout: { fixedW: TREE_ROW_DISCLOSURE_SLOT, fixedH: TREE_ROW_DISCLOSURE_SLOT },
      },
    },
    children: layout.expandable
      ? [{
          kind: "image" as const,
          source: { kind: "icon" as const, icon: treeRowDisclosureIcon(layout.expanded) },
          style: {
            base: {
              image: { color: theme.colors.textMuted, width: Math.max(0, TREE_ROW_DISCLOSURE_SLOT - 4), height: Math.max(0, TREE_ROW_DISCLOSURE_SLOT - 4) },
              layout: { fixedW: TREE_ROW_DISCLOSURE_SLOT, fixedH: TREE_ROW_DISCLOSURE_SLOT },
            },
          },
        }]
      : [],
  }

  return {
    kind: "box",
    style: {
      ...rowSurface({ minH: TREE_ROW_HEIGHT }),
      base: {
        ...((rowSurface({ minH: TREE_ROW_HEIGHT }) as any).base ?? {}),
        layout: {
          ...((rowSurface({ minH: TREE_ROW_HEIGHT }) as any).base?.layout ?? {}),
          padding: { left: TREE_ROW_LEFT_PAD + Math.max(0, layout.depth) * TREE_ROW_INDENT_STEP, right: TREE_ROW_RIGHT_PAD },
          gap: TREE_ROW_DISCLOSURE_GAP,
        },
      },
    },
    children: [
      disclosureRect,
      {
        kind: "text",
        text: layout.leftText,
        style: {
          base: {
            text: {
              color: (layout.variant ?? "item") === "group" ? theme.colors.text : theme.colors.textMuted,
              fontSize: Math.max(10, theme.typography.body.size - 1),
              fontWeight: (layout.variant ?? "item") === "group" ? 600 : 500,
              lineHeight: TREE_ROW_HEIGHT,
              baseline: "middle",
              truncate: true,
            },
            layout: { grow: true, minH: TREE_ROW_HEIGHT },
          },
        },
      },
      ...(layout.rightText
        ? [{
            kind: "text" as const,
            text: layout.rightText,
            style: {
              base: {
                text: {
                  color: theme.colors.textMuted,
                  fontSize: Math.max(10, theme.typography.body.size - 2),
                  fontWeight: 400,
                  lineHeight: TREE_ROW_HEIGHT,
                  align: "end" as const,
                  baseline: "middle" as const,
                  truncate: true,
                },
                layout: { minH: TREE_ROW_HEIGHT },
              },
            },
          }]
        : []),
    ],
  }
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
  private readonly press: PressBinding

  constructor() {
    super()
    this.setBounds(
      () => this.layout.rect,
      () => {
        const r = this.layout.rect
        return this.activeValue && r.w > 0 && r.h > 0
      },
    )

    this.press = usePress(this, {
      enabled: () => this.activeValue,
      onActivateEvent: (e) => {
        if (this.layout.expandable && pointInRect({ x: e.x, y: e.y }, this.disclosureRect())) {
          this.onToggle?.()
          this.invalidateSelf({ force: true })
          return
        }
        this.onSelect?.()
      },
      onStateChange: () => {
        this.invalidateSelf({ pad: 2 })
      },
    })
    this.on("pointercancel", () => {
      this.invalidateSelf({ pad: 2 })
    })

    this.on("doubleclick", (e) => {
      if (!this.hover) return
      if (e.button !== 0) return
      if (this.layout.expandable && pointInRect({ x: e.x, y: e.y }, this.disclosureRect())) return
      this.onDoubleClickHandler?.()
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
    if (!this.activeValue) return
    const r = this.layout.rect
    if (r.w <= 0 || r.h <= 0) return
    drawVisualNode(ctx, buildTreeRowVisual(this.layout, { hover: this.hover, pressed: this.press.pressed() }), r, {
      state: { hover: this.hover, pressed: this.press.pressed(), dragging: false, disabled: false },
      selected: this.layout.selected,
    })
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
  retainedKind: "widget",
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
    state.onSelect = undefined
    state.onToggle = undefined
    state.onDoubleClick = undefined
    state.layout = {
      rect: ZERO_RECT,
      depth: 0,
      expandable: false,
      expanded: false,
      leftText: "",
    }
    state.widget.set(state.layout, undefined, false)
  },
}
