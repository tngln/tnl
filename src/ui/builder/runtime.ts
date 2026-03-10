import { theme } from "../../config/theme"
import { createRichTextBlock } from "../../core/draw.text"
import { ZERO_RECT } from "../../core/rect"
import { createMeasureContext } from "../../platform/web/canvas"
import { SurfaceRoot, ViewportElement, type Surface } from "../base/viewport"
import { UIElement, WheelUIEvent, type Rect, type Vec2 } from "../base/ui"
import { Button, Checkbox, Radio, Row, Scrollbar, TextBox, TreeRow, TREE_ROW_HEIGHT } from "../widgets"
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

type CheckboxCell = {
  widget: Checkbox
  rect: Rect
  label: string
  checked: any
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
  private readonly buttons = new Map<string, ButtonCell>()
  private readonly checkboxes = new Map<string, CheckboxCell>()
  private readonly radios = new Map<string, RadioCell>()
  private readonly textboxes = new Map<string, TextBoxCell>()
  private readonly rows = new Map<string, RowCell>()
  private readonly treeRows = new Map<string, TreeRowCell>()
  private readonly scrollAreas = new Map<string, BuilderScrollAreaElement>()
  private readonly richBlocks = new Map<string, ReturnType<typeof createRichTextBlock>>()
  private readonly usedScrollAreas = new Set<string>()

  constructor(private readonly createTreeSurface: (id: string) => BuilderTreeSurfaceLike) {}

  private updateWidgetActive(widget: UIElement, previous: boolean, next: boolean) {
    if (previous === next) return
    if (next) widget.onRuntimeActivate()
    else widget.onRuntimeDeactivate()
  }

  debugCounts() {
    return {
      buttons: this.buttons.size,
      checkboxes: this.checkboxes.size,
      radios: this.radios.size,
      textboxes: this.textboxes.size,
      rows: this.rows.size,
      treeRows: this.treeRows.size,
      scrollAreas: this.scrollAreas.size,
    }
  }

  hitTest(pSurface: Vec2) {
    return this.root.hitTest(pSurface)
  }

  beginFrame() {
    for (const cell of this.buttons.values()) cell.used = false
    for (const cell of this.checkboxes.values()) cell.used = false
    for (const cell of this.radios.values()) cell.used = false
    for (const cell of this.textboxes.values()) cell.used = false
    for (const cell of this.rows.values()) cell.used = false
    for (const cell of this.treeRows.values()) cell.used = false
    this.usedScrollAreas.clear()
  }

  endFrame() {
    for (const cell of this.buttons.values()) if (!cell.used) {
      this.updateWidgetActive(cell.widget, cell.active, false)
      cell.active = false
    }
    for (const cell of this.checkboxes.values()) if (!cell.used) {
      this.updateWidgetActive(cell.widget, cell.active, false)
      cell.active = false
    }
    for (const cell of this.radios.values()) if (!cell.used) {
      this.updateWidgetActive(cell.widget, cell.active, false)
      cell.active = false
    }
    for (const cell of this.textboxes.values()) if (!cell.used) {
      this.updateWidgetActive(cell.widget, cell.active, false)
      cell.active = false
    }
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
    let cell = this.buttons.get(key)
    if (!cell) {
      cell = {
        rect,
        text: node.text,
        title: node.title,
        active,
        disabled: node.disabled ?? false,
        onClick: node.onClick,
        used: true,
        widget: new Button({
          rect: () => cell!.active ? cell!.rect : ZERO_RECT,
          text: () => cell!.text,
          title: () => cell!.title ?? cell!.text,
          onClick: () => cell!.onClick?.(),
          active: () => cell!.active,
          disabled: () => cell!.disabled,
        }),
      }
      cell.widget.z = 10
      this.buttons.set(key, cell)
      this.root.add(cell.widget)
    }
    cell.rect = rect
    cell.text = node.text
    cell.title = node.title
    this.updateWidgetActive(cell.widget, cell.active, active)
    cell.active = active
    cell.disabled = node.disabled ?? false
    cell.onClick = node.onClick
    cell.used = true
  }

  mountCheckbox(key: string, rect: Rect, node: { label: string; checked: any; disabled?: boolean }, active: boolean) {
    let cell = this.checkboxes.get(key)
    if (!cell) {
      cell = {
        rect,
        label: node.label,
        checked: node.checked,
        active,
        disabled: node.disabled ?? false,
        used: true,
        widget: new Checkbox({
          rect: () => cell!.active ? cell!.rect : ZERO_RECT,
          label: () => cell!.label,
          checked: node.checked,
          active: () => cell!.active,
          disabled: () => cell!.disabled,
        }),
      }
      cell.widget.z = 10
      this.checkboxes.set(key, cell)
      this.root.add(cell.widget)
    }
    cell.rect = rect
    cell.label = node.label
    cell.checked = node.checked
    this.updateWidgetActive(cell.widget, cell.active, active)
    cell.active = active
    cell.disabled = node.disabled ?? false
    cell.used = true
  }

  mountRadio(key: string, rect: Rect, node: { label: string; value: string; selected: any; disabled?: boolean }, active: boolean) {
    let cell = this.radios.get(key)
    if (!cell) {
      cell = {
        rect,
        label: node.label,
        value: node.value,
        selected: node.selected,
        active,
        disabled: node.disabled ?? false,
        used: true,
        widget: new Radio({
          rect: () => cell!.active ? cell!.rect : ZERO_RECT,
          label: () => cell!.label,
          value: node.value,
          selected: node.selected,
          active: () => cell!.active,
          disabled: () => cell!.disabled,
        }),
      }
      cell.widget.z = 10
      this.radios.set(key, cell)
      this.root.add(cell.widget)
    }
    cell.rect = rect
    cell.label = node.label
    cell.value = node.value
    cell.selected = node.selected
    this.updateWidgetActive(cell.widget, cell.active, active)
    cell.active = active
    cell.disabled = node.disabled ?? false
    cell.used = true
  }

  mountTextBox(key: string, rect: Rect, node: { value: any; placeholder?: string; disabled?: boolean }, active: boolean) {
    let cell = this.textboxes.get(key)
    if (!cell) {
      cell = {
        rect,
        value: node.value,
        placeholder: node.placeholder,
        active,
        disabled: node.disabled ?? false,
        used: true,
        widget: new TextBox({
          rect: () => cell!.active ? cell!.rect : ZERO_RECT,
          value: node.value,
          placeholder: () => cell!.placeholder ?? "",
          active: () => cell!.active,
          disabled: () => cell!.disabled,
        }),
      }
      cell.widget.z = 10
      this.textboxes.set(key, cell)
      this.root.add(cell.widget)
    }
    cell.rect = rect
    cell.value = node.value
    cell.placeholder = node.placeholder
    this.updateWidgetActive(cell.widget, cell.active, active)
    cell.active = active
    cell.disabled = node.disabled ?? false
    cell.used = true
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
          onSelect: node.onSelect ? () => node.onSelect?.(row.item.id) : undefined,
          onToggle: row.expandable && node.onToggle ? () => node.onToggle?.(row.item.id) : undefined,
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
