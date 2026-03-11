import { draw, RRect, Text } from "../../core/draw"
import { font, theme } from "../../config/theme"
import { toGetter, type Rect } from "../../core/rect"
import type { TopLayerController } from "../base/top_layer"
import { PointerUIEvent } from "../base/ui"
import { DropdownMenu, DROPDOWN_MENU_ROW_HEIGHT } from "./dropdown_menu"
import { InteractiveElement } from "./interactive"

export type DropdownOption = { value: string; label: string }

function truncateToWidth(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  if (maxWidth <= 0) return ""
  if (ctx.measureText(text).width <= maxWidth) return text
  const ellipsis = "..."
  const ellipsisW = ctx.measureText(ellipsis).width
  if (ellipsisW >= maxWidth) return ""
  let low = 0
  let high = text.length
  while (low < high) {
    const mid = Math.ceil((low + high) / 2)
    const candidate = text.slice(0, mid) + ellipsis
    if (ctx.measureText(candidate).width <= maxWidth) low = mid
    else high = mid - 1
  }
  return text.slice(0, low) + ellipsis
}

function caretDownShape(x: number, y: number, size: number) {
  const s = Math.max(1, size)
  const path = new Path2D()
  path.moveTo(x - s / 2, y - s / 4)
  path.lineTo(x + s / 2, y - s / 4)
  path.lineTo(x, y + s / 2)
  path.closePath()
  return {
    kind: "Shape" as const,
    shape: { viewBox: { x: x - s / 2, y: y - s / 4, w: s, h: (s * 3) / 4 }, path },
    fill: { color: theme.colors.textMuted },
  }
}

export class Dropdown extends InteractiveElement {
  private readonly id: string
  private readonly options: () => DropdownOption[]
  private readonly selected: any
  private readonly topLayer: TopLayerController

  private menu: DropdownMenu | null = null
  private menuRectCache: Rect = { x: 0, y: 0, w: 0, h: 0 }

  constructor(opts: {
    id: string
    rect: () => Rect
    options: DropdownOption[] | (() => DropdownOption[])
    selected: any
    topLayer: TopLayerController
    active?: () => boolean
    disabled?: () => boolean
  }) {
    super(opts)
    this.id = opts.id
    this.options = toGetter(opts.options)
    this.selected = opts.selected
    this.topLayer = opts.topLayer
  }

  private mainRect() {
    return this._rect()
  }

  canFocus() {
    return this.interactive()
  }

  onBlur() {
    this.topLayer.close(this.menuId())
  }

  onPointerDown(e: PointerUIEvent) {
    if (!this.interactive() || e.button !== 0) return
    e.requestFocus(this)
    super.onPointerDown(e)
  }

  private menuId() {
    return `dropdown:${this.id}`
  }

  private computeMenuRect() {
    const r = this.mainRect()
    const options = this.options()
    const h = Math.max(0, options.length * DROPDOWN_MENU_ROW_HEIGHT)
    return { x: r.x, y: r.y + r.h + 2, w: r.w, h }
  }

  protected onActivate() {
    if (this.topLayer.isOpen(this.menuId())) {
      this.topLayer.close(this.menuId())
      return
    }
    this.menuRectCache = this.computeMenuRect()
    if (!this.menu) {
      this.menu = new DropdownMenu({
        rect: () => this.menuRectCache,
        options: () => this.options(),
        selected: this.selected,
        onSelect: (value) => {
          this.selected.set(value)
          this.topLayer.close(this.menuId())
        },
        onDismiss: () => this.topLayer.close(this.menuId()),
      })
    }
    this.topLayer.open(this.menuId(), this.menu)
  }

  onRuntimeDeactivate() {
    this.topLayer.close(this.menuId())
  }

  protected onDraw(ctx: CanvasRenderingContext2D) {
    if (!this._active()) return
    const r = this.mainRect()
    const disabled = this._disabled()
    const pressed = this.pressed()
    const bg = disabled
      ? "rgba(233,237,243,0.03)"
      : pressed
        ? "rgba(233,237,243,0.12)"
        : this.hover
          ? "rgba(233,237,243,0.08)"
          : "rgba(233,237,243,0.06)"
    const stroke = disabled ? "rgba(255,255,255,0.10)" : theme.colors.windowBorder
    const textColor = disabled ? "rgba(233,237,243,0.38)" : theme.colors.textPrimary
    const f = font(theme, theme.typography.body)

    const options = this.options()
    const current = options.find((o) => o.value === this.selected.peek())
    const label = current ? current.label : ""

    ctx.save()
    ctx.font = f
    const labelMax = Math.max(0, r.w - 28)
    const display = truncateToWidth(ctx, label, labelMax)
    ctx.restore()

    draw(
      ctx,
      RRect(
        { x: r.x, y: r.y, w: r.w, h: r.h, r: theme.radii.sm },
        { fill: { color: bg }, stroke: { color: stroke, hairline: true }, pixelSnap: true },
      ),
      Text({
        x: r.x + theme.ui.controls.labelPadX,
        y: r.y + r.h / 2 + 0.5,
        text: display,
        style: { color: textColor, font: f, baseline: "middle" },
      }),
      caretDownShape(r.x + r.w - theme.ui.controls.caretPadX, r.y + r.h / 2, 10),
    )

    if (this.topLayer.isOpen(this.menuId())) this.menuRectCache = this.computeMenuRect()
  }
}
