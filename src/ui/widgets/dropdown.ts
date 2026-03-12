import { draw, RRect, Text } from "../../core/draw"
import { font, theme } from "../../config/theme"
import { truncateToWidth } from "../../core/draw.text"
import { signal, type Signal } from "../../core/reactivity"
import { toGetter, type Rect, ZERO_RECT } from "../../core/rect"
import type { TopLayerController } from "../base/top_layer"
import type { WidgetDescriptor } from "../builder/widget_registry"
import { PointerUIEvent } from "../base/ui"
import { DropdownMenu, DROPDOWN_MENU_ROW_HEIGHT } from "./dropdown_menu"
import { InteractiveElement } from "./interactive"

export type DropdownOption = { value: string; label: string }

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
  private idValue: string = ""
  private optionsValue: DropdownOption[] = []
  private selected: any
  private topLayer?: TopLayerController

  private menu: DropdownMenu | null = null
  private menuRectCache: Rect = { x: 0, y: 0, w: 0, h: 0 }

  constructor(opts: {
    id: string
    rect: () => Rect
    options: DropdownOption[] | (() => DropdownOption[])
    selected: any
    topLayer?: TopLayerController
    active?: () => boolean
    disabled?: () => boolean
  }) {
    super(opts)
    this.selected = opts.selected
    this.update(opts)
  }

  update(opts: { id: string; options: DropdownOption[] | (() => DropdownOption[]); selected: any; topLayer?: TopLayerController }) {
    this.idValue = opts.id
    this.optionsValue = typeof opts.options === "function" ? opts.options() : opts.options
    this.selected = opts.selected
    if (opts.topLayer) this.topLayer = opts.topLayer
  }

  private mainRect() {
    return this._rect()
  }

  canFocus() {
    return this.interactive()
  }

  onBlur() {
    this.topLayer?.close(this.menuId())
  }

  onPointerDown(e: PointerUIEvent) {
    if (!this.interactive() || e.button !== 0) return
    e.requestFocus(this)
    super.onPointerDown(e)
  }

  private menuId() {
    return `dropdown:${this.idValue}`
  }

  private computeMenuRect() {
    const r = this.mainRect()
    const options = this.optionsValue
    const h = Math.max(0, options.length * DROPDOWN_MENU_ROW_HEIGHT)
    return { x: r.x, y: r.y + r.h + 2, w: r.w, h }
  }

  protected onActivate() {
    if (!this.topLayer) return
    if (this.topLayer.isOpen(this.menuId())) {
      this.topLayer.close(this.menuId())
      return
    }
    this.menuRectCache = this.computeMenuRect()
    if (!this.menu) {
      this.menu = new DropdownMenu({
        rect: () => this.menuRectCache,
        options: () => this.optionsValue,
        selected: this.selected,
        onSelect: (value) => {
          this.selected.set(value)
          this.topLayer?.close(this.menuId())
        },
        onDismiss: () => this.topLayer?.close(this.menuId()),
      })
    }
    this.topLayer.open(this.menuId(), this.menu)
  }

  onRuntimeDeactivate() {
    this.topLayer?.close(this.menuId())
  }

  protected onDraw(ctx: CanvasRenderingContext2D) {
    if (!this._active()) return
    const r = this.mainRect()
    const disabled = this._disabled()
    const pressed = this.pressed()
    const bg = disabled
      ? theme.colors.controlDisabled
      : pressed
        ? theme.colors.controlPressed
        : this.hover
          ? theme.colors.controlHover
          : "transparent"
    const stroke = disabled ? "rgba(255,255,255,0.10)" : theme.colors.windowBorder
    const textColor = disabled ? theme.colors.textMuted : theme.colors.textPrimary
    const f = font(theme, theme.typography.body)

    const options = this.optionsValue
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

    if (this.topLayer?.isOpen(this.menuId())) this.menuRectCache = this.computeMenuRect()
  }
}

type DropdownState = {
  widget: Dropdown
  id: string
  rect: Rect
  active: boolean
  disabled: boolean
}

export const dropdownDescriptor: WidgetDescriptor<DropdownState, { options: DropdownOption[]; selected: Signal<string>; disabled?: boolean; topLayer?: TopLayerController }> = {
  id: "dropdown",
  create: (id) => {
    const state = { id, rect: ZERO_RECT, active: false, disabled: false } as DropdownState
    state.widget = new Dropdown({
      id,
      rect: () => state.rect,
      options: [],
      selected: signal(""),
      active: () => state.active,
      disabled: () => state.disabled,
    })
    return state
  },
  getWidget: (state) => state.widget,
  mount: (state, props, rect, active) => {
    state.rect = rect
    state.active = active
    state.disabled = props.disabled ?? false
    state.widget.update({
      id: state.id,
      options: props.options,
      selected: props.selected,
      topLayer: props.topLayer,
    })
  },
}
