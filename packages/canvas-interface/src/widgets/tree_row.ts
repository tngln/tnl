import { theme } from "../theme"
import { ZERO_RECT, type Rect } from "../draw"
import type { RowVariant } from "../builder/types"
import { createVisualHostState, drawVisualHost, syncVisualHostState } from "../builder/visual_host"
import type { RuntimeStateBinding } from "../builder/runtime_state"
import { writeRuntimeRegions } from "../builder/runtime_state"
import { resolveTreeRowRegions } from "../builder/widget_regions"
import { buildTreeRowVisual, treeRowDisclosureIcon as resolveTreeRowDisclosureIcon, type TreeRowVisualModel } from "../builder/widget_visuals"
import { UIElement, pointInRect } from "../ui/ui_base"
import type { IconDef } from "../icons"
import { usePress, type PressBinding } from "../use/use_press"
import type { RetainedPayload, WidgetDescriptor } from "../builder/widget_registry"

export const TREE_ROW_HEIGHT = theme.ui.controls.treeRowHeight
export const TREE_ROW_INDENT_STEP = theme.ui.controls.treeRow.indentStep
export const TREE_ROW_DISCLOSURE_SLOT = theme.ui.controls.treeRow.disclosureSlot
const TREE_ROW_DISCLOSURE_GAP = theme.ui.controls.treeRow.disclosureGap
const TREE_ROW_LEFT_PAD = theme.ui.controls.treeRow.leftPad
const TREE_ROW_RIGHT_PAD = theme.ui.controls.treeRow.rightPad

export type TreeRowLayout = TreeRowVisualModel & {
  rect: Rect
}

export type TreeRowBehaviorProps = {
  onSelect?: () => void
  onToggle?: () => void
  onDoubleClick?: () => void
}

export type TreeRowWidgetProps = RetainedPayload<TreeRowBehaviorProps, TreeRowVisualModel>

export function treeRowDisclosureIcon(expanded: boolean): IconDef {
  return resolveTreeRowDisclosureIcon(expanded)
}

export class TreeRow extends UIElement {
  private activeValue: boolean = true
  private runtimeState?: RuntimeStateBinding
  private readonly visualHost = createVisualHostState<TreeRowVisualModel>()
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
        if (this.layout.expandable && pointInRect({ x: e.x, y: e.y }, resolveTreeRowRegions(this.layout).disclosureRect)) {
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
      if (this.layout.expandable && pointInRect({ x: e.x, y: e.y }, resolveTreeRowRegions(this.layout).disclosureRect)) return
      this.onDoubleClickHandler?.()
    })
  }

  set(layout: TreeRowLayout, handlers?: { onSelect?: () => void; onToggle?: () => void; onDoubleClick?: () => void }, active?: boolean) {
    this.layout = layout
    this.onSelect = handlers?.onSelect
    this.onToggle = handlers?.onToggle
    this.onDoubleClickHandler = handlers?.onDoubleClick
    if (active !== undefined) this.activeValue = active
    syncVisualHostState(this.visualHost, {
      rect: layout.rect,
      model: { ...layout },
      context: {
        state: { hover: this.hover, pressed: this.press.pressed(), dragging: false, disabled: false },
        selected: layout.selected,
      },
    })
    const disclosure = resolveTreeRowRegions(layout).disclosureRect
    writeRuntimeRegions(this.runtimeState, {
      primaryRect: layout.rect,
      anchorRect: disclosure,
      hitRegions: { disclosure },
    }, {
      active: this.activeValue,
      hover: this.hover,
      pressed: this.press.pressed(),
    })
  }

  bindRuntimeState(binding: RuntimeStateBinding | undefined) {
    this.runtimeState = binding
  }

  disclosureRect() {
    return resolveTreeRowRegions(this.layout).disclosureRect
  }

  protected onDraw(ctx: CanvasRenderingContext2D) {
    if (!this.activeValue) return
    const r = this.layout.rect
    if (r.w <= 0 || r.h <= 0) return
    syncVisualHostState(this.visualHost, {
      rect: r,
      model: { ...this.layout },
      context: {
        state: { hover: this.hover, pressed: this.press.pressed(), dragging: false, disabled: false },
        selected: this.layout.selected,
      },
    })
    const disclosure = resolveTreeRowRegions(this.layout).disclosureRect
    writeRuntimeRegions(this.runtimeState, {
      primaryRect: r,
      anchorRect: disclosure,
      hitRegions: { disclosure },
    }, {
      active: this.activeValue,
      hover: this.hover,
      pressed: this.press.pressed(),
    })
    drawVisualHost(ctx, this.visualHost, buildTreeRowVisual)
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

export const treeRowDescriptor: WidgetDescriptor<TreeRowState, TreeRowWidgetProps> = {
  id: "treeRow",
  retainedKind: "widget",
  capabilityShape: { behavior: true, visual: true, layout: true },
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
    state.onSelect = props.behavior.onSelect
    state.onToggle = props.behavior.onToggle
    state.onDoubleClick = props.behavior.onDoubleClick
    state.layout = {
      rect: active ? rect : ZERO_RECT,
      depth: active ? props.visual.depth : 0,
      expandable: active ? props.visual.expandable : false,
      expanded: active ? props.visual.expanded : false,
      leftText: active ? props.visual.leftText : "",
      rightText: active ? props.visual.rightText : undefined,
      variant: active ? props.visual.variant : undefined,
      selected: active ? props.visual.selected : undefined,
    }
    state.widget.bindRuntimeState(props.runtimeState)
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
