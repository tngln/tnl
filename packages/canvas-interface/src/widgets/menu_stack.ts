import type { Rect, Vec2 } from "../draw"
import type { TopLayerController } from "../ui/top_layer"
import { useClickOutsideHandler } from "../ui/top_layer"
import { UIElement } from "../ui/ui_base"
import { Menu, measureMenuHeight, type MenuItem } from "./menu"
import { placeFloatingRect } from "./floating"

type Panel = {
  keyPath: string
  rect: Rect
  items: MenuItem[]
  menu: Menu
  anchor: Rect
}

export class MenuStack extends UIElement {
  private readonly topLayer: TopLayerController
  private readonly id: string
  private readonly viewport: () => Rect
  private panels: Panel[] = []
  private selectedPath: string[] = []
  private open = false
  private dismissCleanup: (() => void) | null = null

  constructor(opts: { id: string; topLayer: TopLayerController; viewport: () => Rect }) {
    super()
    this.id = opts.id
    this.topLayer = opts.topLayer
    this.viewport = opts.viewport
    this.setBounds(this.viewport)
  }

  hitTest(p: Vec2, ctx?: CanvasRenderingContext2D) {
    if (!this.visible) return null
    for (let i = this.children.length - 1; i >= 0; i--) {
      const hit = this.children[i].hitTest(p, ctx)
      if (hit) return hit
    }
    return null
  }

  closeAll() {
    this.open = false
    this.selectedPath = []
    this.panels = []
    this.children = []
    this.dismissCleanup?.()
    this.dismissCleanup = null
  }

  openRoot(anchor: Rect, items: MenuItem[], opts: { placement?: "bottom-start" | "top-start" } = {}) {
    const placement = opts.placement ?? "bottom-start"
    const vp = this.viewport()
    const w = 220
    const h = measureMenuHeight(items)
    const rect = placeFloatingRect({ viewport: vp, anchor, size: { w, h }, placement, offset: 2, pad: 8 })
    const menu = new Menu({
      rect: () => this.panels[0]?.rect ?? rect,
      items: () => this.panels[0]?.items ?? items,
      onSelect: () => this.closeAll(),
      onDismiss: () => this.closeAll(),
      onHoverItem: (info) => this.onHoverAtLevel(0, info),
    })
    menu.z = 1
    this.panels = [{ keyPath: "root", rect, items, menu, anchor }]
    this.children = [menu]
    this.open = true
    this.dismissCleanup = useClickOutsideHandler({
      id: this.id,
      element: this,
      topLayer: this.topLayer,
      onDismiss: () => this.closeAll(),
    })
  }

  private onHoverAtLevel(level: number, info: { index: number; rect: Rect; item: Exclude<MenuItem, { kind: "separator" }> } | null) {
    if (!this.open) return
    this.panels = this.panels.slice(0, level + 1)
    this.children = this.children.slice(0, level + 1)
    this.selectedPath = this.selectedPath.slice(0, level)
    if (!info) return
    const item = info.item
    this.selectedPath[level] = item.key
    if (!item.submenu || item.disabled) return

    const vp = this.viewport()
    const items = item.submenu
    const w = 240
    const h = measureMenuHeight(items)
    const anchor = { x: info.rect.x, y: info.rect.y, w: info.rect.w, h: info.rect.h }
    const rect = placeFloatingRect({ viewport: vp, anchor, size: { w, h }, placement: "right-start", offset: 2, pad: 8 })
    const keyPath = `${this.panels[level]!.keyPath}/${item.key}`
    const menu = new Menu({
      rect: () => {
        const p = this.panels[level + 1]
        return p ? p.rect : rect
      },
      items: () => {
        const p = this.panels[level + 1]
        return p ? p.items : items
      },
      onSelect: () => this.closeAll(),
      onDismiss: () => this.closeAll(),
      onHoverItem: (next) => this.onHoverAtLevel(level + 1, next),
    })
    menu.z = 1 + (level + 1)
    this.panels.push({ keyPath, rect, items, menu, anchor })
    this.children.push(menu)
    this.children.sort((a, b) => a.z - b.z)
    this.topLayer.open(this.id, this)
  }
}
