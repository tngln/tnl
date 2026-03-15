import { font, theme, neutral } from "@/config/theme"
import { draw, RectOp, TextOp } from "@/core/draw"
import { truncateToWidth } from "@/core/draw.text"
import { signal, type Signal } from "@/core/reactivity"
import { toGetter, type Rect, ZERO_RECT } from "@/core/rect"
import { PointerUIEvent } from "@/ui/base/ui"
import type { TopLayerController } from "@/ui/base/top_layer"
import type { WidgetDescriptor } from "@/ui/builder/widget_registry"
import { caretDownIcon, iconToShape } from "@/ui/icons"
import { DropdownMenu, DROPDOWN_MENU_ROW_HEIGHT } from "./dropdown_menu"
import { InteractiveElement } from "./interactive"

export type DropdownOption = { value: string; label: string }

export class Dropdown extends InteractiveElement {
  private idValue: string = ""
  private optionsValue: DropdownOption[] = []
  private selected: any
  private topLayer?: TopLayerController

  private menu: DropdownMenu | null = null
  private menuRectCache: Rect = ZERO_RECT

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
      ? theme.colors.disabled
      : pressed
        ? theme.colors.pressed
        : this.hover
          ? theme.colors.hover
          : "transparent"
    const stroke = disabled ? neutral[400] : theme.colors.border
    const textColor = disabled ? theme.colors.textMuted : theme.colors.text
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
      RectOp(
        { x: r.x, y: r.y, w: r.w, h: r.h },
        { radius: theme.radii.sm, fill: { color: bg }, stroke: { color: stroke, hairline: true } },
      ),
      TextOp({
        x: r.x + theme.ui.controls.labelPadX,
        y: r.y + r.h / 2 + 0.5,
        text: display,
        style: { color: textColor, font: f, baseline: "middle" },
      }),
      iconToShape(
        caretDownIcon,
        {
          x: r.x + r.w - theme.ui.controls.caretPadX - 5,
          y: r.y + r.h / 2 - 5,
          w: 10,
          h: 10,
        },
        { color: theme.colors.textMuted },
      ),
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
