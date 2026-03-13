import { createRichTextBlock, type RichTextBlock } from "../../core/draw.text"
import { invalidateAll } from "../invalidate"
import { SurfaceRoot, type Surface } from "../base/viewport"
import { UIElement, WheelUIEvent, type Rect, type Vec2 } from "../base/ui"
import { TopLayerController } from "../base/top_layer"
import { widgetRegistry } from "./widget_registry"
import { TREE_ROW_HEIGHT } from "../widgets"
import type { BuilderNode, TreeItem, TreeViewNode } from "./types"

export type BuilderTreeSurfaceLike = Surface & {
  setNode(node: BuilderNode | null): void
  setWheelFallback(fn: ((e: WheelUIEvent) => void) | null): void
  contentSize(viewportSize: Vec2): Vec2
  measureWithContext(ctx: CanvasRenderingContext2D, viewportSize: Vec2): Vec2
}

export type DrawOp = (ctx: CanvasRenderingContext2D) => void

export class BuilderRuntime {
  readonly root = new SurfaceRoot()
  readonly topLayer = new TopLayerController({ rect: () => this.root.bounds(), invalidate: invalidateAll, z: 8_000_000 })
  private readonly widgets = new Map<string, Map<string, { state: any; widget: UIElement; active: boolean; used: boolean }>>()
  private readonly richBlocks = new Map<string, ReturnType<typeof createRichTextBlock>>()

  constructor(private readonly createTreeSurface: (id: string) => BuilderTreeSurfaceLike) {
    this.root.add(this.topLayer.host)
  }

  private updateWidgetActive(widget: UIElement, previous: boolean, next: boolean) {
    if (previous === next) return
    if (next) widget.onRuntimeActivate()
    else widget.onRuntimeDeactivate()
  }

  debugCounts() {
    return {
      widgets: this.widgets.size,
    }
  }

  hitTest(pSurface: Vec2) {
    return this.root.hitTest(pSurface)
  }

  beginFrame() {
    for (const map of this.widgets.values()) {
      for (const cell of map.values()) cell.used = false
    }
  }

  endFrame() {
    for (const [kind, map] of this.widgets) {
      const descriptor = widgetRegistry.get(kind)
      for (const cell of map.values()) {
        if (cell.used) continue
        this.updateWidgetActive(cell.widget, cell.active, false)
        cell.active = false
        descriptor?.unmount?.(cell.state)
      }
    }
  }

  treeSurfaceFactory() {
    return this.createTreeSurface
  }

  ensureRichBlock(key: string, spans: Parameters<typeof createRichTextBlock>[0], style: Parameters<typeof createRichTextBlock>[1], align?: "start" | "center" | "end") {
    const hit = this.richBlocks.get(key)
    if (hit) return hit
    const next = createRichTextBlock(spans, style, { align: align ?? "start", wrap: "word" })
    this.richBlocks.set(key, next)
    return next
  }

  mountWidget<TState, TProps>(kind: string, key: string, rect: Rect, props: TProps, active: boolean) {
    const descriptor = widgetRegistry.get(kind) as any as import("./widget_registry").WidgetDescriptor<TState, TProps>
    if (!descriptor) return

    let kindMap = this.widgets.get(kind)
    if (!kindMap) {
      kindMap = new Map()
      this.widgets.set(kind, kindMap)
    }

    let cell = kindMap.get(key)
    if (!cell) {
      const state = descriptor.create(key)
      cell = {
        state,
        widget: descriptor.getWidget(state),
        active,
        used: true,
      }
      cell.widget.z = descriptor.initialZIndex ?? 10
      kindMap.set(key, cell)
      this.root.add(cell.widget)
    }

    cell.used = true
    descriptor.mount(cell.state, props, rect, active)

    this.updateWidgetActive(cell.widget, cell.active, active)
    cell.active = active
  }

  mountRichTextSelectable(key: string, rect: Rect, block: RichTextBlock, active: boolean) {
    this.mountWidget("richTextSelectable", key, rect, { block, topLayer: this.topLayer }, active)
  }

  mountRadio(key: string, rect: Rect, node: { label: string; value: string; selected: any; disabled?: boolean }, active: boolean) {
    this.mountWidget("radio", key, rect, node, active)
  }

  mountSlider(key: string, rect: Rect, node: { min: number; max: number; value: number; onChange?: (next: number) => void; disabled?: boolean }, active: boolean) {
    this.mountWidget("slider", key, rect, node, active)
  }

  mountRow(key: string, rect: Rect, node: { leftText: string; rightText?: string; indent?: number; variant?: "group" | "item"; selected?: boolean; onClick?: () => void }, active: boolean) {
    this.mountWidget("listRow", key, rect, node, active)
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
                invalidateAll()
              }
            : undefined,
          onToggle:
            row.expandable && node.onToggle
              ? () => {
                  node.onToggle?.(row.item.id)
                  invalidateAll()
                }
              : undefined,
        },
        active,
      )
    }
  }

  mountTreeRow(key: string, rect: Rect, node: {
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
    this.mountWidget("treeRow", key, rect, node, active)
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
