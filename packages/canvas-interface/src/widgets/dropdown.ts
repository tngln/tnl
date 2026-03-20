import { type Rect, ZERO_RECT } from "../draw"
import { signal, type Signal } from "../reactivity"
import { PointerUIEvent } from "../ui_base"
import type { TopLayerController } from "../top_layer"
import { useClickOutsideHandler } from "../top_layer"
import type { WidgetDescriptor } from "../builder/widget_registry"
import { createVisualHostState, drawVisualHost, syncVisualHostState } from "../builder/visual_host"
import type { RuntimeStateBinding } from "../builder/runtime_state"
import { writeRuntimeRegions } from "../builder/runtime_state"
import { resolveDropdownRegions } from "../builder/widget_regions"
import { buildDropdownVisual, resolveDropdownVisualModel, type DropdownVisualModel } from "../builder/widget_visuals"
import { DropdownMenu, DROPDOWN_MENU_ROW_HEIGHT } from "./dropdown_menu"
import { InteractiveElement } from "./interactive"
import type { RetainedPayload } from "../builder/widget_registry"

export type DropdownOption = { value: string; label: string }
export type DropdownBehaviorProps = {
  options: DropdownOption[]
  selected: Signal<string>
  topLayer?: TopLayerController
}

export type DropdownWidgetProps = RetainedPayload<DropdownBehaviorProps, DropdownVisualModel>

export class Dropdown extends InteractiveElement {
  private idValue: string = ""
  private optionsValue: DropdownOption[] = []
  private selected: Signal<string>
  private topLayer?: TopLayerController
  private runtimeState?: RuntimeStateBinding
  private visualModelValue: DropdownVisualModel = { label: "" }
  private readonly visualHost = createVisualHostState<DropdownVisualModel>()

  private menu: DropdownMenu | null = null
  private menuRectCache: Rect = ZERO_RECT
  private dismissCleanup: (() => void) | null = null

  constructor(opts: {
    id: string
    rect: () => Rect
    options: DropdownOption[] | (() => DropdownOption[])
    selected: Signal<string>
    topLayer?: TopLayerController
    active?: () => boolean
    disabled?: () => boolean
  }) {
    super(opts)
    this.selected = opts.selected
    const options = typeof opts.options === "function" ? opts.options() : opts.options
    this.update({
      id: opts.id,
      behavior: { options, selected: opts.selected, topLayer: opts.topLayer },
      visual: resolveDropdownVisualModel({ options, selectedValue: opts.selected.peek() }),
    })

    this.on("blur", () => {
      this.closeMenu()
    })

    this.on("pointerdown", (e: PointerUIEvent) => {
      if (!this.interactive() || e.button !== 0) return
      e.requestFocus(this)
    })
  }

  update(opts: { id: string; behavior: DropdownBehaviorProps; visual: DropdownVisualModel }) {
    this.idValue = opts.id
    this.optionsValue = opts.behavior.options
    this.selected = opts.behavior.selected
    this.visualModelValue = opts.visual
    if (opts.behavior.topLayer) this.topLayer = opts.behavior.topLayer
  }

  bindRuntimeState(binding: RuntimeStateBinding | undefined) {
    this.runtimeState = binding
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
    return resolveDropdownRegions({ rect: this.mainRect(), optionCount: this.optionsValue.length }).overlayRect
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

    syncVisualHostState(this.visualHost, {
      rect: r,
      model: this.visualModelValue,
      context: {
        state: { hover: this.hover, pressed, dragging: false, disabled },
        disabled,
      },
    })
    const regions = resolveDropdownRegions({ rect: r, optionCount: this.optionsValue.length })
    const menuRect = this.topLayer?.isOpen(this.menuId()) ? regions.overlayRect : undefined
    writeRuntimeRegions(this.runtimeState, {
      primaryRect: regions.primaryRect,
      anchorRect: regions.anchorRect,
      overlayRect: menuRect,
    }, {
      active: this._active(),
      disabled,
      hover: this.hover,
      pressed,
      open: this.topLayer?.isOpen(this.menuId()) ?? false,
    })
    drawVisualHost(ctx, this.visualHost, buildDropdownVisual)

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

export const dropdownDescriptor: WidgetDescriptor<DropdownState, DropdownWidgetProps> = {
  id: "dropdown",
  retainedKind: "widget",
  capabilityShape: { behavior: true, visual: true, layout: true },
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
  mount: (state, props: DropdownWidgetProps, rect, active) => {
    state.rect = rect
    state.active = active
    state.disabled = props.disabled ?? false
    state.widget.bindRuntimeState(props.runtimeState)
    state.widget.update({
      id: state.id,
      behavior: props.behavior,
      visual: props.visual,
    })
  },
}
