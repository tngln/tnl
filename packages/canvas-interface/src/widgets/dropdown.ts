import { type Rect, ZERO_RECT } from "../draw"
import { signal, type Signal } from "../reactivity"
import { PointerUIEvent } from "../ui_base"
import type { TopLayerController } from "../top_layer"
import { useClickOutsideHandler } from "../top_layer"
import type { WidgetDescriptor } from "../builder/widget_registry"
import { caretDownIcon } from "../icons"
import { drawVisualNode, type VisualStyleInput } from "../builder/visual"
import { textControlFrame } from "../builder/visual.presets"
import { DropdownMenu, DROPDOWN_MENU_ROW_HEIGHT } from "./dropdown_menu"
import { InteractiveElement } from "./interactive"

export type DropdownOption = { value: string; label: string }

export class Dropdown extends InteractiveElement {
  private idValue: string = ""
  private optionsValue: DropdownOption[] = []
  private selected: any
  private topLayer?: TopLayerController
  private visualStyleValue: VisualStyleInput | undefined

  private menu: DropdownMenu | null = null
  private menuRectCache: Rect = ZERO_RECT
  private dismissCleanup: (() => void) | null = null

  constructor(opts: {
    id: string
    rect: () => Rect
    options: DropdownOption[] | (() => DropdownOption[])
    selected: any
    topLayer?: TopLayerController
    active?: () => boolean
    disabled?: () => boolean
    visualStyle?: VisualStyleInput
  }) {
    super(opts)
    this.selected = opts.selected
    this.update(opts)

    this.on("blur", () => {
      this.closeMenu()
    })

    this.on("pointerdown", (e: PointerUIEvent) => {
      if (!this.interactive() || e.button !== 0) return
      e.requestFocus(this)
    })
  }

  update(opts: { id: string; options: DropdownOption[] | (() => DropdownOption[]); selected: any; topLayer?: TopLayerController; visualStyle?: VisualStyleInput }) {
    this.idValue = opts.id
    this.optionsValue = typeof opts.options === "function" ? opts.options() : opts.options
    this.selected = opts.selected
    this.visualStyleValue = opts.visualStyle
    if (opts.topLayer) this.topLayer = opts.topLayer
  }

  private mainRect() {
    return this._rect()
  }

  canFocus() {
    return this.interactive()
  }

  private closeMenu() {
    this.dismissCleanup?.()
    this.dismissCleanup = null
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
      this.closeMenu()
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
          this.closeMenu()
        },
        onDismiss: () => this.closeMenu(),
      })
    }
    this.dismissCleanup = useClickOutsideHandler({
      id: this.menuId(),
      element: this.menu,
      topLayer: this.topLayer,
      onDismiss: () => this.closeMenu(),
    })
  }

  onRuntimeDeactivate() {
    this.closeMenu()
  }

  protected onDraw(ctx: CanvasRenderingContext2D) {
    if (!this._active()) return
    const r = this.mainRect()
    const disabled = this._disabled()
    const pressed = this.pressed()

    const options = this.optionsValue
    const current = options.find((o) => o.value === this.selected.peek())
    const label = current ? current.label : ""
    drawVisualNode(ctx, {
      kind: "box",
      style: {
        ...(textControlFrame() as any),
        ...((this.visualStyleValue as any) ?? {}),
      },
      children: [
        {
          kind: "box",
          style: {
            base: {
              layout: { axis: "row", align: "center", justify: "between", grow: true },
            },
          },
          children: [
            {
              kind: "text",
              text: label,
              style: {
                base: {
                  text: { baseline: "middle", truncate: true },
                  layout: { grow: true, minH: r.h },
                },
              },
            },
            {
              kind: "image",
              source: { kind: "icon", icon: caretDownIcon },
              style: {
                base: {
                  image: { color: "rgba(233,237,243,0.40)", width: 10, height: 10 },
                  layout: { fixedW: 10, fixedH: 10 },
                },
              },
            },
          ],
        },
      ],
    }, r, {
      state: { hover: this.hover, pressed, dragging: false, disabled },
      disabled,
    })

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

export const dropdownDescriptor: WidgetDescriptor<DropdownState, { options: DropdownOption[]; selected: Signal<string>; disabled?: boolean; topLayer?: TopLayerController; visualStyle?: VisualStyleInput }> = {
  id: "dropdown",
  retainedKind: "widget",
  create: (id) => {
    const state = { id, rect: ZERO_RECT, active: false, disabled: false } as DropdownState
    state.widget = new Dropdown({
      id,
      rect: () => state.rect,
      options: [],
      selected: signal(""),
      active: () => state.active,
      disabled: () => state.disabled,
      visualStyle: undefined,
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
      visualStyle: props.visualStyle,
    })
  },
}
