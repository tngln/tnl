import { draw, RRect } from "../../../../core/draw"
import { theme } from "../../../../config/theme"
import { signal } from "../../../../core/reactivity"
import { UIElement, type Rect, type Vec2, WheelUIEvent } from "../../../base/ui"
import { Row as RowWidget, Scrollbar } from "../../../widgets"
import type { Surface, ViewportContext } from "../../../base/viewport"
import type { DeveloperPanelSpec } from "../index"
import { getStateTree, type DataNode } from "../states"

export function createDataPanel(): DeveloperPanelSpec {
  return {
    id: "Developer.Data",
    title: "Data",
    build: (_ctx) => new DataPanelSurface(),
  }
}

class SurfaceRoot extends UIElement {
  bounds(): Rect {
    return { x: -1e9, y: -1e9, w: 2e9, h: 2e9 }
  }
}

function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v))
}

type FlatRow = { kind: "group" | "signal"; id: string; depth: number; label: string; right?: string }

class DataPanelSurface implements Surface {
  readonly id = "Developer.Data.Surface"
  private readonly root = new SurfaceRoot()
  private size: Vec2 = { x: 0, y: 0 }
  private readonly scroll = signal(0)
  private contentH = 0
  private readonly expanded = new Set<string>()
  private initialized = false
  private readonly scrollbar: Scrollbar
  private readonly rowWidgets: RowWidget[] = []

  constructor() {
    this.scrollbar = new Scrollbar({
      rect: () => ({ x: Math.max(0, this.size.x - 10 - 2), y: 2, w: 10, h: Math.max(0, this.size.y - 4) }),
      axis: "y",
      viewportSize: () => Math.max(0, this.size.y),
      contentSize: () => this.contentH,
      value: () => this.scroll.peek(),
      onChange: (next) => this.scroll.set(next),
    })
    this.root.add(this.scrollbar)
  }

  private rows(tree: DataNode[]): FlatRow[] {
    const rows: FlatRow[] = []
    for (const g of tree) {
      if (g.kind !== "group") continue
      rows.push({ kind: "group", id: g.id, depth: 0, label: `${g.label}`, right: `${g.count}` })
      if (!this.expanded.has(g.id)) continue
      for (const c of g.children) {
        if (c.kind !== "signal") continue
        rows.push({
          kind: "signal",
          id: c.id,
          depth: 1,
          label: c.label,
          right: `${c.valuePreview}${c.subscribers ? ` · ${c.subscribers}` : ""}`,
        })
      }
    }
    return rows
  }

  private maxScroll(rows: FlatRow[]) {
    const rowH = 22
    const pad = 4
    this.contentH = Math.max(0, rows.length * rowH + pad)
    return Math.max(0, this.contentH - this.size.y)
  }

  private toggleGroup(id: string) {
    if (this.expanded.has(id)) this.expanded.delete(id)
    else this.expanded.add(id)
    const maxY = this.maxScroll(this.rows(getStateTree()))
    this.scroll.set((v) => clamp(v, 0, maxY))
  }

  hitTest(pSurface: Vec2) {
    return this.root.hitTest(pSurface)
  }

  onWheel(e: WheelUIEvent, _viewport: ViewportContext) {
    const tree = getStateTree()
    const rows = this.rows(tree)
    const maxY = this.maxScroll(rows)
    const next = clamp(this.scroll.peek() + e.deltaY, 0, maxY)
    if (next === this.scroll.peek()) return
    this.scroll.set(next)
    e.handle()
  }

  render(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, viewport: ViewportContext) {
    this.size = { x: viewport.contentRect.w, y: viewport.contentRect.h }
    const tree = getStateTree()
    if (!this.initialized) {
      for (const n of tree) if (n.kind === "group") this.expanded.add(n.id)
      this.initialized = true
    }
    const rows = this.rows(tree)
    const maxY = this.maxScroll(rows)
    this.scroll.set((v) => clamp(v, 0, maxY))

    const c = ctx as any as CanvasRenderingContext2D
    const rowH = 22
    const topPad = 2
    const clipW = Math.max(0, this.size.x - 14)

    draw(
      c,
      RRect({ x: 0, y: 0, w: this.size.x, h: this.size.y, r: theme.radii.sm }, { fill: { color: "rgba(255,255,255,0.01)" } }),
    )

    const y0 = this.scroll.peek()
    const first = Math.max(0, Math.floor((y0 - topPad) / rowH))
    const visible = Math.ceil(this.size.y / rowH) + 2
    const last = Math.min(rows.length - 1, first + visible)

    while (this.rowWidgets.length < visible) {
      const r = new RowWidget()
      r.z = 1
      this.rowWidgets.push(r)
      this.root.add(r)
    }

    for (let i = 0; i < this.rowWidgets.length; i++) {
      const rowIndex = first + i
      const w = this.rowWidgets[i]
      const row = rows[rowIndex]
      if (!row || rowIndex > last) {
        w.set({ rect: { x: 0, y: 0, w: 0, h: 0 }, leftText: "" })
        continue
      }
      const y = topPad + rowIndex * rowH - y0
      w.set(
        {
          rect: { x: 2, y, w: clipW, h: rowH },
          indent: row.depth * 14,
          leftText: row.label,
          rightText: row.right,
          variant: row.kind === "group" ? "group" : "item",
        },
        row.kind === "group" ? () => this.toggleGroup(row.id) : undefined,
      )
    }

    this.root.draw(c)
  }
}
