import { draw, RRect, Text } from "../../core/draw"
import type { InteractionCancelReason } from "../../core/event_stream"
import { createPressMachine } from "../../core/fsm"
import { font, theme } from "../../config/theme"
import { toGetter, type Rect } from "../../core/rect"
import { PointerUIEvent, UIElement, pointInRect, type Vec2 } from "../base/ui"

export type DropdownMenuOption = { value: string; label: string }
export const DROPDOWN_MENU_ROW_HEIGHT = theme.ui.controls.menuItemHeight

export class DropdownMenu extends UIElement {
  private readonly rect: () => Rect
  private readonly options: () => DropdownMenuOption[]
  private readonly selected: any
  private readonly onSelect: (value: string) => void
  private readonly onDismiss: () => void

  private hover = false
  private hoveredIndex = -1
  private readonly press = createPressMachine()

  constructor(opts: {
    rect: () => Rect
    options: DropdownMenuOption[] | (() => DropdownMenuOption[])
    selected: any
    onSelect: (value: string) => void
    onDismiss: () => void
  }) {
    super()
    this.rect = opts.rect
    this.options = toGetter(opts.options)
    this.selected = opts.selected
    this.onSelect = opts.onSelect
    this.onDismiss = opts.onDismiss
  }

  bounds(): Rect {
    return this.rect()
  }

  protected containsPoint(p: Vec2) {
    return pointInRect(p, this.bounds())
  }

  private rowHeight() {
    return DROPDOWN_MENU_ROW_HEIGHT
  }

  private indexFromPoint(p: Vec2) {
    const menu = this.bounds()
    if (!pointInRect(p, menu)) return -1
    const idx = Math.floor((p.y - menu.y) / this.rowHeight())
    const options = this.options()
    if (idx < 0 || idx >= options.length) return -1
    return idx
  }

  onPointerEnter() {
    this.hover = true
  }

  onPointerLeave() {
    this.hover = false
    this.hoveredIndex = -1
    if (this.press.matches("pressed")) this.press.send({ type: "CANCEL", reason: "leave" })
  }

  onPointerDown(e: PointerUIEvent) {
    if (e.button !== 0) return
    this.press.send({ type: "PRESS", point: { x: e.x, y: e.y } })
    e.capture()
  }

  onPointerMove(e: PointerUIEvent) {
    if (!this.hover) return
    const idx = this.indexFromPoint({ x: e.x, y: e.y })
    if (idx !== this.hoveredIndex) {
      this.hoveredIndex = idx
      this.invalidateSelf({ pad: 8 })
    }
  }

  onPointerUp(e: PointerUIEvent) {
    if (!this.press.matches("pressed")) return
    this.press.send({ type: "RELEASE", point: { x: e.x, y: e.y } })
    if (!this.hover) return
    const idx = this.indexFromPoint({ x: e.x, y: e.y })
    const opt = this.options()[idx]
    if (opt) {
      this.onSelect(opt.value)
      return
    }
    this.onDismiss()
  }

  onPointerCancel(_e: PointerUIEvent | null, reason: InteractionCancelReason) {
    this.hover = false
    this.hoveredIndex = -1
    if (!this.press.matches("pressed")) return
    this.press.send({ type: "CANCEL", reason })
  }

  protected onDraw(ctx: CanvasRenderingContext2D) {
    const menu = this.bounds()
    if (menu.w <= 0 || menu.h <= 0) return
    const f = font(theme, theme.typography.body)
    draw(
      ctx,
      RRect(
        { x: menu.x, y: menu.y, w: menu.w, h: menu.h, r: theme.radii.sm },
        { fill: { color: "rgba(11,15,23,0.96)" }, stroke: { color: "rgba(255,255,255,0.12)", hairline: true }, pixelSnap: true },
      ),
    )

    const options = this.options()
    const rowH = this.rowHeight()
    const selectedValue = this.selected.peek()
    for (let i = 0; i < options.length; i++) {
      const y = menu.y + i * rowH
      const row = { x: menu.x + 1, y, w: Math.max(0, menu.w - 2), h: rowH }
      const hovered = i === this.hoveredIndex
      const selected = options[i].value === selectedValue
      if (hovered || selected) {
        draw(ctx, { kind: "Rect", rect: row, fill: { color: hovered ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.06)" } })
      }
      draw(
        ctx,
        Text({
          x: row.x + 8,
          y: row.y + row.h / 2 + 0.5,
          text: options[i].label,
          style: { color: theme.colors.textPrimary, font: f, baseline: "middle" },
        }),
      )
    }
  }
}
