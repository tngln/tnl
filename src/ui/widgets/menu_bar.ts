import { font, theme, neutral } from "@/config/theme"
import { draw, LineOp, RectOp, TextOp } from "@/core/draw"
import { measureTextWidth } from "@/core/draw.text"
import { createPressMachine } from "@/core/fsm"
import { UIElement, pointInRect, type Rect, type Vec2 } from "@/ui/base/ui"
import type { TopLayerController } from "@/ui/base/top_layer"
import type { MenuItem } from "./menu"
import { MenuStack } from "./menu_stack"

export type MenuBarMenu = {
  key: string
  label: string
  items: MenuItem[]
}

export class MenuBar extends UIElement {
  private readonly rect: () => Rect
  private readonly menus: () => MenuBarMenu[]
  private readonly topLayer: TopLayerController
  private readonly menuId: string

  private hoveredIndex = -1
  private readonly press = createPressMachine()

  private openKey: string | null = null
  private readonly stack: MenuStack

  private menuLabelRects: Rect[] = []

  constructor(opts: {
    id: string
    rect: () => Rect
    menus: MenuBarMenu[] | (() => MenuBarMenu[])
    topLayer: TopLayerController
  }) {
    super()
    this.rect = opts.rect
    this.menus =
      typeof opts.menus === "function" ? (opts.menus as () => MenuBarMenu[]) : () => opts.menus as MenuBarMenu[]
    this.topLayer = opts.topLayer
    this.menuId = `menubar:${opts.id}`
    this.stack = new MenuStack({ id: this.menuId, topLayer: this.topLayer, viewport: () => this.topLayer.host.bounds() })
    this.setBounds(this.rect)

    this.on("pointerleave", () => {
      this.hoveredIndex = -1
      if (this.press.matches("pressed")) this.press.send({ type: "CANCEL", reason: "leave" })
    })
    this.on("pointerdown", (e) => {
      this.syncOpen()
      if (e.button !== 0) return
      this.press.send({ type: "PRESS", point: { x: e.x, y: e.y } })
      e.capture()
    })
    this.on("pointermove", (e) => {
      this.syncOpen()
      if (!this.hover) return
      const idx = this.indexFromPoint({ x: e.x, y: e.y })
      if (idx !== this.hoveredIndex) {
        this.hoveredIndex = idx
        e.handle()
        this.invalidateSelf({ pad: 8 })
      }
      if (this.openKey && idx >= 0 && this.topLayer.isOpen(this.menuId)) {
        const m = this.menus()[idx]
        if (m && m.key !== this.openKey) this.openMenu(idx)
      }
    })
    this.on("pointerup", (e) => {
      this.syncOpen()
      if (!this.press.matches("pressed")) return
      this.press.send({ type: "RELEASE", point: { x: e.x, y: e.y } })
      if (!this.hover) return
      const idx = this.indexFromPoint({ x: e.x, y: e.y })
      if (idx >= 0) this.openMenu(idx)
    })
    this.on("pointercancel", ({ reason }) => {
      this.hoveredIndex = -1
      if (!this.press.matches("pressed")) return
      this.press.send({ type: "CANCEL", reason })
    })
  }

  private syncOpen() {
    if (this.openKey && !this.topLayer.isOpen(this.menuId)) this.openKey = null
  }

  private indexFromPoint(p: Vec2) {
    const r = this.bounds()
    if (!pointInRect(p, r)) return -1
    if (!this.menuLabelRects.length) {
      const menus = this.menus()
      const w = 64
      const gap = 2
      let x = r.x + 6
      this.menuLabelRects = []
      for (let i = 0; i < menus.length; i++) {
        this.menuLabelRects.push({ x, y: r.y, w, h: r.h })
        x += w + gap
      }
    }
    for (let i = 0; i < this.menuLabelRects.length; i++) {
      if (pointInRect(p, this.menuLabelRects[i]!)) return i
    }
    return -1
  }

  private closeMenu() {
    this.stack.closeAll()
    this.openKey = null
  }

  private openMenu(idx: number) {
    const menus = this.menus()
    const m = menus[idx]
    if (!m) return
    const cur = this.openKey
    if (cur === m.key && this.topLayer.isOpen(this.menuId)) {
      this.closeMenu()
      return
    }

    const anchor = this.menuLabelRects[idx] ?? this.bounds()
    this.openKey = m.key
    this.stack.openRoot(anchor, m.items, { placement: "bottom-start" })
  }

  protected onDraw(ctx: CanvasRenderingContext2D) {
    const r = this.bounds()
    if (r.w <= 0 || r.h <= 0) return

    draw(
      ctx,
      RectOp(r, { fill: { paint: neutral[750] } }),
      LineOp({ x: r.x, y: r.y + r.h }, { x: r.x + r.w, y: r.y + r.h }, { color: neutral[400], hairline: true }),
    )

    const f = font(theme, theme.typography.body)
    ctx.save()
    ctx.font = f
    const menus = this.menus()
    const padX = 10
    const gap = 2
    let x = r.x + 6
    this.menuLabelRects = []
    for (let i = 0; i < menus.length; i++) {
      const m = menus[i]!
      const w = Math.ceil(measureTextWidth(ctx, m.label, f) + padX * 2)
      const rect = { x, y: r.y, w, h: r.h }
      this.menuLabelRects.push(rect)
      const hovered = i === this.hoveredIndex
      const opened = this.openKey === m.key && this.topLayer.isOpen(this.menuId)
      if (hovered || opened) {
        draw(ctx, RectOp({ x: rect.x, y: rect.y + 2, w: rect.w, h: Math.max(0, rect.h - 4) }, { fill: { paint: neutral[600] } }))
      }
      draw(
        ctx,
        TextOp({
          x: rect.x + padX,
          y: rect.y + rect.h / 2 + 0.5,
          text: m.label,
          style: { color: theme.colors.text, font: f, baseline: "middle" },
        }),
      )
      x += w + gap
    }
    ctx.restore()
  }
}
