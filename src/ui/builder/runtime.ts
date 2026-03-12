import { theme } from "../../config/theme"
import { createRichTextBlock } from "../../core/draw.text"
import { ZERO_RECT } from "../../core/rect"
import { invalidateAll } from "../invalidate"
import { createMeasureContext } from "../../platform/web/canvas"
import { SurfaceRoot, ViewportElement, type Surface } from "../base/viewport"
import { UIElement, WheelUIEvent, type Rect, type Vec2 } from "../base/ui"
import { TopLayerController } from "../base/top_layer"
import { Button, Checkbox, ClickArea, Dropdown, Radio, Row, Scrollbar, Slider, TextBox, TreeRow, TREE_ROW_HEIGHT } from "../widgets"
import { clamp } from "./utils"
import type { BuilderNode, TreeItem, TreeViewNode } from "./types"

export type BuilderTreeSurfaceLike = Surface & {
  setNode(node: BuilderNode | null): void
  setWheelFallback(fn: ((e: WheelUIEvent) => void) | null): void
  contentSize(viewportSize: Vec2): Vec2
  measureWithContext(ctx: CanvasRenderingContext2D, viewportSize: Vec2): Vec2
}

type ButtonCell = {
  widget: Button
  rect: Rect
  text: string
  title?: string
  active: boolean
  disabled: boolean
  onClick?: () => void
  used: boolean
}

type ClickAreaCell = {
  widget: ClickArea
  rect: Rect
  active: boolean
  disabled: boolean
  onClick?: () => void
  used: boolean
}

type CheckboxCell = {
  widget: Checkbox
  rect: Rect
  label: string
  checked: any
  active: boolean
  disabled: boolean
  used: boolean
}

type DropdownCell = {
  widget: Dropdown
  rect: Rect
  options: Array<{ value: string; label: string }>
  selected: any
  active: boolean
  disabled: boolean
  used: boolean
}

type RadioCell = {
  widget: Radio
  rect: Rect
  label: string
  value: string
  selected: any
  active: boolean
  disabled: boolean
  used: boolean
}

type TextBoxCell = {
  widget: TextBox
  rect: Rect
  value: any
  placeholder?: string
  active: boolean
  disabled: boolean
  used: boolean
}

type SliderCell = {
  widget: Slider
  rect: Rect
  min: number
  max: number
  value: number
  active: boolean
  disabled: boolean
  onChange?: (next: number) => void
  used: boolean
}

type RowCell = {
  widget: Row
  rect: Rect
  leftText: string
  rightText?: string
  indent: number
  variant: "group" | "item"
  selected: boolean
  active: boolean
  onClick?: () => void
  used: boolean
}

type TreeRowCell = {
  widget: TreeRow
  rect: Rect
  depth: number
  expandable: boolean
  expanded: boolean
  leftText: string
  rightText?: string
  variant: "group" | "item"
  selected: boolean
  active: boolean
  onSelect?: () => void
  onToggle?: () => void
  used: boolean
}

export type DrawOp = (ctx: CanvasRenderingContext2D) => void

class BuilderScrollAreaElement extends UIElement {
  private rect: Rect = ZERO_RECT
  private active = false
  private readonly contentSurface: BuilderTreeSurfaceLike
  private readonly viewport: ViewportElement
  private readonly scrollbar: Scrollbar
  private scrollY = 0
  private contentH = 0

  constructor(id: string, createTreeSurface: (id: string) => BuilderTreeSurfaceLike) {
    super()
    this.contentSurface = createTreeSurface(`${id}.Content`)
    this.contentSurface.setWheelFallback((e) => this.onContentWheel(e))
    this.viewport = new ViewportElement({
      rect: () => this.rect,
      target: this.contentSurface,
      options: { clip: true, scroll: () => ({ x: 0, y: this.scrollY }), active: () => this.active },
    })
    this.viewport.z = 1
    this.scrollbar = new Scrollbar({
      rect: () => ({
        x: this.rect.x + Math.max(0, this.rect.w - 12),
        y: this.rect.y + 2,
        w: 10,
        h: Math.max(0, this.rect.h - 4),
      }),
      axis: "y",
      viewportSize: () => Math.max(0, this.rect.h),
      contentSize: () => this.contentH,
      value: () => this.scrollY,
      onChange: (next) => {
        this.scrollY = clamp(next, 0, this.maxScroll())
      },
      active: () => this.active,
    })
    this.scrollbar.z = 10
    this.add(this.viewport)
    this.add(this.scrollbar)
  }

  private maxScroll() {
    return Math.max(0, this.contentH - this.rect.h)
  }

  private onContentWheel(e: WheelUIEvent) {
    const next = clamp(this.scrollY + e.deltaY, 0, this.maxScroll())
    if (next === this.scrollY) return
    this.scrollY = next
    e.handle()
  }

  set(next: { rect: Rect; active: boolean; child: BuilderNode }, measureCtx?: CanvasRenderingContext2D) {
    this.rect = next.rect
    this.active = next.active && next.rect.w > 0 && next.rect.h > 0
    this.contentSurface.setNode(next.child)
    const content = measureCtx
      ? this.contentSurface.measureWithContext(measureCtx, { x: Math.max(0, next.rect.w - 14), y: next.rect.h })
      : this.contentSurface.contentSize({ x: Math.max(0, next.rect.w - 14), y: next.rect.h })
    this.contentH = Math.max(next.rect.h, content.y)
    this.scrollY = clamp(this.scrollY, 0, this.maxScroll())
  }

  bounds() {
    if (!this.active) return ZERO_RECT
    return this.rect
  }
}

export class BuilderRuntime {
  readonly root = new SurfaceRoot()
  readonly topLayer = new TopLayerController({ rect: () => this.root.bounds(), invalidate: invalidateAll, z: 8_000_000 })
  private readonly buttons = new Map<string, ButtonCell>()
  private readonly clickAreas = new Map<string, ClickAreaCell>()
  private readonly checkboxes = new Map<string, CheckboxCell>()
  private readonly dropdowns = new Map<string, DropdownCell>()
  private readonly radios = new Map<string, RadioCell>()
  private readonly textboxes = new Map<string, TextBoxCell>()
  private readonly sliders = new Map<string, SliderCell>()
  private readonly rows = new Map<string, RowCell>()
  private readonly treeRows = new Map<string, TreeRowCell>()
  private readonly scrollAreas = new Map<string, BuilderScrollAreaElement>()
  private readonly richBlocks = new Map<string, ReturnType<typeof createRichTextBlock>>()
  private readonly usedScrollAreas = new Set<string>()

  constructor(private readonly createTreeSurface: (id: string) => BuilderTreeSurfaceLike) {
    this.root.add(this.topLayer.host)
  }

  private updateWidgetActive(widget: UIElement, previous: boolean, next: boolean) {
    if (previous === next) return
    if (next) widget.onRuntimeActivate()
    else widget.onRuntimeDeactivate()
  }

  private markAllUnused<TCell extends { used: boolean }>(map: Map<string, TCell>) {
    for (const cell of map.values()) cell.used = false
  }

  private deactivateUnusedWidgetCells<TCell extends { widget: UIElement; active: boolean; used: boolean }>(map: Map<string, TCell>) {
    for (const cell of map.values()) {
      if (cell.used) continue
      this.updateWidgetActive(cell.widget, cell.active, false)
      cell.active = false
    }
  }

  private widgetRuntime(cell: { rect: Rect; active: boolean; disabled: boolean }) {
    return {
      rect: () => cell.active ? cell.rect : ZERO_RECT,
      active: () => cell.active,
      disabled: () => cell.disabled,
    }
  }

  private initWidgetCell<TCell extends { widget: UIElement }>(init: Omit<TCell, "widget">, createWidget: (cell: TCell) => TCell["widget"]) {
    const cell = init as unknown as TCell
    ;(cell as any).widget = createWidget(cell)
    return cell
  }

  private mountWidgetCell<TCell extends { widget: UIElement; active: boolean; used: boolean }>(
    map: Map<string, TCell>,
    key: string,
    create: () => TCell,
    active: boolean,
    update: (cell: TCell) => void,
    z = 10,
  ) {
    let cell = map.get(key)
    if (!cell) {
      cell = create()
      cell.widget.z = z
      map.set(key, cell)
      this.root.add(cell.widget)
    }
    update(cell)
    this.updateWidgetActive(cell.widget, cell.active, active)
    cell.active = active
    cell.used = true
  }

  debugCounts() {
    return {
      buttons: this.buttons.size,
      clickAreas: this.clickAreas.size,
      checkboxes: this.checkboxes.size,
      dropdowns: this.dropdowns.size,
      radios: this.radios.size,
      textboxes: this.textboxes.size,
      sliders: this.sliders.size,
      rows: this.rows.size,
      treeRows: this.treeRows.size,
      scrollAreas: this.scrollAreas.size,
    }
  }

  hitTest(pSurface: Vec2) {
    return this.root.hitTest(pSurface)
  }

  beginFrame() {
    this.markAllUnused(this.buttons)
    this.markAllUnused(this.clickAreas)
    this.markAllUnused(this.checkboxes)
    this.markAllUnused(this.dropdowns)
    this.markAllUnused(this.radios)
    this.markAllUnused(this.textboxes)
    this.markAllUnused(this.sliders)
    this.markAllUnused(this.rows)
    this.markAllUnused(this.treeRows)
    this.usedScrollAreas.clear()
  }

  endFrame() {
    this.deactivateUnusedWidgetCells(this.buttons)
    this.deactivateUnusedWidgetCells(this.clickAreas)
    this.deactivateUnusedWidgetCells(this.checkboxes)
    this.deactivateUnusedWidgetCells(this.dropdowns)
    this.deactivateUnusedWidgetCells(this.radios)
    this.deactivateUnusedWidgetCells(this.textboxes)
    this.deactivateUnusedWidgetCells(this.sliders)
    for (const cell of this.rows.values()) {
      if (cell.used) continue
      cell.active = false
      cell.widget.set({ rect: ZERO_RECT, leftText: "" })
    }
    for (const cell of this.treeRows.values()) {
      if (cell.used) continue
      cell.active = false
      cell.widget.set({
        rect: ZERO_RECT,
        depth: 0,
        expandable: false,
        expanded: false,
        leftText: "",
      })
    }
    for (const [key, area] of this.scrollAreas) {
      if (this.usedScrollAreas.has(key)) continue
      area.set({ rect: ZERO_RECT, active: false, child: { kind: "spacer" } })
    }
  }

  ensureRichBlock(key: string, spans: Parameters<typeof createRichTextBlock>[0], style: Parameters<typeof createRichTextBlock>[1], align?: "start" | "center" | "end") {
    const hit = this.richBlocks.get(key)
    if (hit) return hit
    const next = createRichTextBlock(spans, style, { align: align ?? "start", wrap: "word" })
    this.richBlocks.set(key, next)
    return next
  }

  mountButton(key: string, rect: Rect, node: { text: string; title?: string; disabled?: boolean; onClick?: () => void }, active: boolean) {
    this.mountWidgetCell(
      this.buttons,
      key,
      () => {
        return this.initWidgetCell<ButtonCell>(
          {
            rect,
            text: node.text,
            title: node.title,
            active,
            disabled: node.disabled ?? false,
            onClick: node.onClick,
            used: false,
          },
          (cell) =>
            new Button({
              ...this.widgetRuntime(cell),
              text: () => cell.text,
              title: () => cell.title ?? cell.text,
              onClick: () => cell.onClick?.(),
            }),
        )
      },
      active,
      (cell) => {
        cell.rect = rect
        cell.text = node.text
        cell.title = node.title
        cell.disabled = node.disabled ?? false
        cell.onClick = node.onClick
      },
    )
  }

  mountClickArea(key: string, rect: Rect, node: { disabled?: boolean; onClick?: () => void }, active: boolean) {
    this.mountWidgetCell(
      this.clickAreas,
      key,
      () => {
        return this.initWidgetCell<ClickAreaCell>(
          {
            rect,
            active,
            disabled: node.disabled ?? false,
            onClick: node.onClick,
            used: false,
          },
          (cell) =>
            new ClickArea({
              ...this.widgetRuntime(cell),
              onClick: () => cell.onClick?.(),
            }),
        )
      },
      active,
      (cell) => {
        cell.rect = rect
        cell.disabled = node.disabled ?? false
        cell.onClick = node.onClick
      },
      12,
    )
  }

  mountCheckbox(key: string, rect: Rect, node: { label: string; checked: any; disabled?: boolean }, active: boolean) {
    this.mountWidgetCell(
      this.checkboxes,
      key,
      () => {
        return this.initWidgetCell<CheckboxCell>(
          {
            rect,
            label: node.label,
            checked: node.checked,
            active,
            disabled: node.disabled ?? false,
            used: false,
          },
          (cell) =>
            new Checkbox({
              ...this.widgetRuntime(cell),
              label: () => cell.label,
              checked: node.checked,
            }),
        )
      },
      active,
      (cell) => {
        cell.rect = rect
        cell.label = node.label
        cell.checked = node.checked
        cell.disabled = node.disabled ?? false
      },
    )
  }

  mountDropdown(key: string, rect: Rect, node: { options: Array<{ value: string; label: string }>; selected: any; disabled?: boolean }, active: boolean) {
    this.mountWidgetCell(
      this.dropdowns,
      key,
      () => {
        return this.initWidgetCell<DropdownCell>(
          {
            rect,
            options: node.options,
            selected: node.selected,
            active,
            disabled: node.disabled ?? false,
            used: false,
          },
          (cell) =>
            new Dropdown({
              id: key,
              ...this.widgetRuntime(cell),
              options: () => cell.options,
              selected: node.selected,
              topLayer: this.topLayer,
            }),
        )
      },
      active,
      (cell) => {
        cell.rect = rect
        cell.options = node.options
        cell.selected = node.selected
        cell.disabled = node.disabled ?? false
      },
    )
  }

  mountRadio(key: string, rect: Rect, node: { label: string; value: string; selected: any; disabled?: boolean }, active: boolean) {
    this.mountWidgetCell(
      this.radios,
      key,
      () => {
        return this.initWidgetCell<RadioCell>(
          {
            rect,
            label: node.label,
            value: node.value,
            selected: node.selected,
            active,
            disabled: node.disabled ?? false,
            used: false,
          },
          (cell) =>
            new Radio({
              ...this.widgetRuntime(cell),
              label: () => cell.label,
              value: node.value,
              selected: node.selected,
            }),
        )
      },
      active,
      (cell) => {
        cell.rect = rect
        cell.label = node.label
        cell.value = node.value
        cell.selected = node.selected
        cell.disabled = node.disabled ?? false
      },
    )
  }

  mountTextBox(key: string, rect: Rect, node: { value: any; placeholder?: string; disabled?: boolean }, active: boolean) {
    this.mountWidgetCell(
      this.textboxes,
      key,
      () => {
        return this.initWidgetCell<TextBoxCell>(
          {
            rect,
            value: node.value,
            placeholder: node.placeholder,
            active,
            disabled: node.disabled ?? false,
            used: false,
          },
          (cell) =>
            new TextBox({
              ...this.widgetRuntime(cell),
              value: node.value,
              placeholder: () => cell.placeholder ?? "",
            }),
        )
      },
      active,
      (cell) => {
        cell.rect = rect
        cell.value = node.value
        cell.placeholder = node.placeholder
        cell.disabled = node.disabled ?? false
      },
    )
  }

  mountSlider(key: string, rect: Rect, node: { min: number; max: number; value: number; onChange?: (next: number) => void; disabled?: boolean }, active: boolean) {
    this.mountWidgetCell(
      this.sliders,
      key,
      () => {
        return this.initWidgetCell<SliderCell>(
          {
            rect,
            min: node.min,
            max: node.max,
            value: node.value,
            active,
            disabled: node.disabled ?? false,
            onChange: node.onChange,
            used: false,
          },
          (cell) =>
            new Slider({
              ...this.widgetRuntime(cell),
              min: () => cell.min,
              max: () => cell.max,
              value: () => cell.value,
              onChange: (next) => cell.onChange?.(next),
            }),
        )
      },
      active,
      (cell) => {
        cell.rect = rect
        cell.min = node.min
        cell.max = node.max
        cell.value = node.value
        cell.disabled = node.disabled ?? false
        cell.onChange = node.onChange
      },
    )
  }

  mountRow(key: string, rect: Rect, node: { leftText: string; rightText?: string; indent?: number; variant?: "group" | "item"; selected?: boolean; onClick?: () => void }, active: boolean) {
    let cell = this.rows.get(key)
    if (!cell) {
      cell = {
        rect,
        leftText: node.leftText,
        rightText: node.rightText,
        indent: node.indent ?? 0,
        variant: node.variant ?? "item",
        selected: node.selected ?? false,
        active,
        onClick: node.onClick,
        used: true,
        widget: new Row(),
      }
      cell.widget.z = 10
      this.rows.set(key, cell)
      this.root.add(cell.widget)
    }
    cell.rect = rect
    cell.leftText = node.leftText
    cell.rightText = node.rightText
    cell.indent = node.indent ?? 0
    cell.variant = node.variant ?? "item"
    cell.selected = node.selected ?? false
    cell.active = active
    cell.onClick = node.onClick
    cell.used = true
    cell.widget.set(
      active
        ? {
            rect,
            leftText: node.leftText,
            rightText: node.rightText,
            indent: node.indent ?? 0,
            variant: node.variant ?? "item",
            selected: node.selected,
          }
        : { rect: ZERO_RECT, leftText: "" },
      active ? node.onClick : undefined,
    )
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

  mountTreeRow(
    key: string,
    rect: Rect,
    node: {
      depth: number
      expandable: boolean
      expanded: boolean
      leftText: string
      rightText?: string
      variant?: "group" | "item"
      selected?: boolean
      onSelect?: () => void
      onToggle?: () => void
    },
    active: boolean,
  ) {
    let cell = this.treeRows.get(key)
    if (!cell) {
      cell = {
        rect,
        depth: node.depth,
        expandable: node.expandable,
        expanded: node.expanded,
        leftText: node.leftText,
        rightText: node.rightText,
        variant: node.variant ?? "item",
        selected: node.selected ?? false,
        active,
        onSelect: node.onSelect,
        onToggle: node.onToggle,
        used: true,
        widget: new TreeRow(),
      }
      cell.widget.z = 10
      this.treeRows.set(key, cell)
      this.root.add(cell.widget)
    }
    cell.rect = rect
    cell.depth = node.depth
    cell.expandable = node.expandable
    cell.expanded = node.expanded
    cell.leftText = node.leftText
    cell.rightText = node.rightText
    cell.variant = node.variant ?? "item"
    cell.selected = node.selected ?? false
    cell.active = active
    cell.onSelect = node.onSelect
    cell.onToggle = node.onToggle
    cell.used = true
    cell.widget.set(
      active
        ? {
            rect,
            depth: node.depth,
            expandable: node.expandable,
            expanded: node.expanded,
            leftText: node.leftText,
            rightText: node.rightText,
            variant: node.variant ?? "item",
            selected: node.selected,
          }
        : {
            rect: ZERO_RECT,
            depth: 0,
            expandable: false,
            expanded: false,
            leftText: "",
          },
      active ? { onSelect: node.onSelect, onToggle: node.onToggle } : undefined,
    )
  }

  mountScrollArea(key: string, rect: Rect, node: { child: BuilderNode }, active: boolean, ctx: CanvasRenderingContext2D) {
    let area = this.scrollAreas.get(key)
    if (!area) {
      area = new BuilderScrollAreaElement(key, this.createTreeSurface)
      area.z = 5
      this.scrollAreas.set(key, area)
      this.root.add(area)
    }
    this.usedScrollAreas.add(key)
    area.set({ rect, active, child: node.child }, ctx)
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
