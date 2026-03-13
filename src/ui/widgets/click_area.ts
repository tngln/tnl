import { ZERO_RECT, type Rect } from "@/core/rect"
import type { WidgetDescriptor } from "@/ui/builder/widget_registry"
import { InteractiveElement } from "./interactive"

export class ClickArea extends InteractiveElement {
  private readonly onClick: (() => void) | undefined

  constructor(opts: { rect: () => Rect; onClick?: () => void; active?: () => boolean; disabled?: () => boolean }) {
    super(opts)
    this.onClick = opts.onClick
  }

  protected onActivate() {
    this.onClick?.()
  }

  protected onDraw(_ctx: CanvasRenderingContext2D) {}
}

type ClickAreaState = {
  widget: ClickArea
  rect: Rect
  active: boolean
  disabled: boolean
  onClick?: () => void
}

export const clickAreaDescriptor: WidgetDescriptor<ClickAreaState, { disabled?: boolean; onClick?: () => void }> = {
  id: "clickArea",
  initialZIndex: 12,
  create: () => {
    const state = { rect: ZERO_RECT, active: false, disabled: false } as ClickAreaState
    state.widget = new ClickArea({
      rect: () => state.rect,
      active: () => state.active,
      disabled: () => state.disabled,
      onClick: () => state.onClick?.(),
    })
    return state
  },
  getWidget: (state) => state.widget,
  mount: (state, props, rect, active) => {
    state.rect = rect
    state.active = active
    state.disabled = props.disabled ?? false
    state.onClick = props.onClick
  },
}
