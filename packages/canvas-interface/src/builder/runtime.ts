import { createRichTextBlock, type RichTextBlock } from "../draw"
import type { InteractionCancelReason } from "../event_stream"
import { invalidateAll } from "../invalidate"
import { SurfaceRoot, type Surface } from "../viewport"
import { UIElement, WheelUIEvent, type Rect, type Vec2, type CursorKind, type PointerUIEvent } from "../ui_base"
import { TopLayerController } from "../top_layer"
import { widgetRegistry, type WidgetDescriptor } from "./widget_registry"
import { TREE_ROW_HEIGHT } from "../widgets/tree_row"
import type { BuilderNode, TreeItem, TreeViewNode } from "./types"
import { ControlElement, type ControlDrawFn } from "./control"
import { NodeRuntimeStateStore } from "./runtime_state"

export type BuilderTreeSurfaceLike = Surface & {
  setNode(node: BuilderNode | null): void
  setWheelFallback(fn: ((e: WheelUIEvent) => void) | null): void
  contentSize(viewportSize: Vec2): Vec2
  measureWithContext(ctx: CanvasRenderingContext2D, viewportSize: Vec2): Vec2
}

export type DrawOp = (ctx: CanvasRenderingContext2D) => void

type RetainedCell<TState = unknown, TProps = unknown> = {
  descriptor: WidgetDescriptor<TState, TProps>
  state: TState
  element: UIElement
  active: boolean
  used: boolean
}

export type ControlMountOpts = {
  disabled?: boolean
  draw: ControlDrawFn
  onClick?: () => void
  onDoubleClick?: () => void
  onPointerDown?: (e: PointerUIEvent) => void
  onPointerMove?: (e: PointerUIEvent) => void
  onPointerUp?: (e: PointerUIEvent) => void
  onPointerCancel?: (reason: InteractionCancelReason) => void
  cursor?: CursorKind
}

type ControlCellState = {
  el: ControlElement
}

const controlDescriptor: WidgetDescriptor<ControlCellState, ControlMountOpts> = {
  id: "__builder.control__",
  retainedKind: "control",
  create: () => ({ el: new ControlElement() }),
  getWidget: (state) => state.el,
  mount: (state, props, rect, active) => {
    state.el.update({
      rect,
      active,
      disabled: props.disabled ?? false,
      draw: props.draw,
      onClick: props.onClick,
      onDoubleClick: props.onDoubleClick,
      onPointerDown: props.onPointerDown,
      onPointerMove: props.onPointerMove,
      onPointerUp: props.onPointerUp,
      onPointerCancel: props.onPointerCancel,
      cursor: props.cursor,
    })
  },
  unmount: (state) => {
    state.el.update({ rect: { x: 0, y: 0, w: 0, h: 0 }, active: false, disabled: false, draw: () => {} })
  },
}

export class BuilderRuntime {
  readonly root = new SurfaceRoot()
  readonly topLayer = new TopLayerController({ rect: () => this.root.bounds(), invalidate: invalidateAll, z: 8_000_000 })
  readonly nodeStateStore = new NodeRuntimeStateStore()
  private readonly retained = new Map<string, Map<string, RetainedCell>>()
  private readonly richBlocks = new Map<string, ReturnType<typeof createRichTextBlock>>()
  private invalidateSurface: () => void = invalidateAll

  constructor(private readonly createTreeSurface: (id: string) => BuilderTreeSurfaceLike) {
    this.root.add(this.topLayer.host)
  }

  setInvalidator(fn: (() => void) | null) {
    this.invalidateSurface = fn ?? invalidateAll
    this.topLayer.setInvalidator(fn)
  }

  private updateWidgetActive(widget: UIElement, previous: boolean, next: boolean) {
    if (previous === next) return
    if (next) widget.onRuntimeActivate()
    else widget.onRuntimeDeactivate("inactive")
  }

  debugCounts() {
    let retained = 0
    let controls = 0
    let statefulWidgets = 0
    for (const map of this.retained.values()) {
      retained += map.size
      const first = map.values().next().value as RetainedCell | undefined
      if ((first?.descriptor.retainedKind ?? "widget") === "control") controls += map.size
      else statefulWidgets += map.size
    }
    return {
      widgets: retained,
      retained,
      controls,
      statefulWidgets,
    }
  }

  hitTest(pSurface: Vec2) {
    return this.root.hitTest(pSurface)
  }

  beginFrame() {
    for (const map of this.retained.values()) {
      for (const cell of map.values()) cell.used = false
    }
  }

  endFrame() {
    for (const map of this.retained.values()) {
      for (const cell of map.values()) {
        if (cell.used) continue
        this.updateWidgetActive(cell.element, cell.active, false)
        cell.active = false
        cell.descriptor.unmount?.(cell.state)
      }
    }
  }

  treeSurfaceFactory() {
    return this.createTreeSurface
  }

  ensureRichBlock(key: string, spans: Parameters<typeof createRichTextBlock>[0], style: Parameters<typeof createRichTextBlock>[1], align?: "start" | "center" | "end") {
    const hit = this.richBlocks.get(key)
    if (hit) return hit
    const next = createRichTextBlock(spans, style, { align: align ?? "start" })
    this.richBlocks.set(key, next)
    return next
  }

  mountWidget<TState, TProps>(kind: string, key: string, rect: Rect, props: TProps, active: boolean) {
    const descriptor = widgetRegistry.get(kind) as WidgetDescriptor<TState, TProps> | undefined
    if (!descriptor) return
    this.mountRetained(descriptor, key, rect, props, active)
  }

  mountControl(key: string, rect: Rect, active: boolean, opts: ControlMountOpts) {
    this.mountRetained(controlDescriptor, key, rect, opts, active)
  }

  mountRichTextSelectable(key: string, rect: Rect, block: RichTextBlock, active: boolean) {
    this.mountWidget("richTextSelectable", key, rect, { block, topLayer: this.topLayer }, active)
  }

  mountTreeView(key: string, rect: Rect, node: TreeViewNode, active: boolean) {
    const rows = flattenTreeItems(node.items, node.expanded)
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      const rowKey = `${key}.${row.id}`
      const rowRect = {
        x: rect.x,
        y: rect.y + i * TREE_ROW_HEIGHT,
        w: rect.w,
        h: TREE_ROW_HEIGHT,
      }
      this.mountTreeRow(
        rowKey,
        rowRect,
        {
          runtimeState: { key: rowKey, store: this.nodeStateStore },
          depth: row.depth,
          expandable: row.expandable,
          expanded: row.expanded,
          leftText: row.item.label,
          rightText: row.item.meta,
          variant: row.item.variant ?? "item",
          selected: node.selectedId === row.item.id,
          onSelect: node.onSelect
            ? () => {
                node.onSelect?.(row.item.id)
                this.invalidateSurface()
              }
            : undefined,
          onToggle:
            row.expandable && node.onToggle
              ? () => {
                  node.onToggle?.(row.item.id)
                  this.invalidateSurface()
                }
              : undefined,
        },
        active,
      )
    }
  }

  mountTreeRow(key: string, rect: Rect, node: {
    runtimeState?: { key: string; store: NodeRuntimeStateStore }
    depth: number
    expandable: boolean
    expanded: boolean
    leftText: string
    rightText?: string
    variant?: "group" | "item"
    selected?: boolean
    onSelect?: () => void
    onToggle?: () => void
  }, active: boolean) {
    this.mountWidget("treeRow", key, rect, {
      behavior: {
        onSelect: node.onSelect,
        onToggle: node.onToggle,
      },
      visual: {
        depth: node.depth,
        expandable: node.expandable,
        expanded: node.expanded,
        leftText: node.leftText,
        rightText: node.rightText,
        variant: node.variant,
        selected: node.selected,
      },
      runtimeState: node.runtimeState,
    }, active)
  }

  private mountRetained<TState, TProps>(descriptor: WidgetDescriptor<TState, TProps>, key: string, rect: Rect, props: TProps, active: boolean) {
    let kindMap = this.retained.get(descriptor.id)
    if (!kindMap) {
      kindMap = new Map()
      this.retained.set(descriptor.id, kindMap)
    }

    let cell = kindMap.get(key) as RetainedCell<TState, TProps> | undefined
    if (!cell) {
      const state = descriptor.create(key)
      const element = descriptor.getWidget(state)
      cell = {
        descriptor,
        state,
        element,
        active,
        used: true,
      }
      element.z = descriptor.initialZIndex ?? 10
      kindMap.set(key, cell as RetainedCell)
      this.root.add(element)
    }

    cell.used = true
    descriptor.mount(cell.state, props, rect, active)
    this.updateWidgetActive(cell.element, cell.active, active)
    cell.active = active
  }

}

type VisibleTreeRow = {
  id: string
  depth: number
  item: TreeItem
  expandable: boolean
  expanded: boolean
}

export function flattenTreeItems(items: TreeItem[], expanded: ReadonlySet<string>) {
  const rows: VisibleTreeRow[] = []
  const visit = (item: TreeItem, depth: number) => {
    const children = item.children ?? []
    const expandable = children.length > 0
    const isExpanded = expandable && expanded.has(item.id)
    rows.push({
      id: item.id,
      depth,
      item,
      expandable,
      expanded: isExpanded,
    })
    if (!isExpanded) return
    for (const child of children) visit(child, depth + 1)
  }
  for (const item of items) visit(item, 0)
  return rows
}
