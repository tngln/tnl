import { theme } from "@/config/theme"
import { draw, LineOp, RectOp } from "@/core/draw"
import { clamp, type Rect, ZERO_RECT } from "@/core/rect"
import { PointerUIEvent, UIElement, type Vec2 } from "@/ui/base/ui"
import type { WidgetDescriptor } from "@/ui/builder/widget_registry"

type Axis = "x" | "y"

export class Slider extends UIElement {
  private rectValue: Rect = ZERO_RECT
  private axis: Axis = "x"
  private min: number = 0
  private max: number = 1
  private value: number = 0
  private onChange: (next: number) => void = () => {}
  private activeValue: boolean = true
  private disabledValue: boolean = false
  private thumbSize: number = 12
  private trackThickness: number = 4

  private hover = false
  private dragging = false

  constructor(opts: {
    rect: () => Rect
    axis?: Axis
    min?: number | (() => number)
    max?: number | (() => number)
    value: () => number
    onChange: (next: number) => void
    active?: () => boolean
    disabled?: () => boolean
    thumbSize?: number
    trackThickness?: number
  }) {
    super()
    this.update(opts)
    this.setBounds(() => this.rectValue, () => this.activeValue)
    this.z = 20
  }

  update(opts: {
    rect: () => Rect
    axis?: Axis
    min?: number | (() => number)
    max?: number | (() => number)
    value: () => number
    onChange: (next: number) => void
    active?: () => boolean
    disabled?: () => boolean
    thumbSize?: number
    trackThickness?: number
  }) {
    this.rectValue = opts.rect()
    this.axis = opts.axis ?? "x"
    this.min = typeof opts.min === "function" ? opts.min() : (opts.min ?? 0)
    this.max = typeof opts.max === "function" ? opts.max() : (opts.max ?? 1)
    this.value = opts.value()
    this.onChange = opts.onChange
    this.activeValue = opts.active ? opts.active() : true
    this.disabledValue = opts.disabled ? opts.disabled() : false
    this.thumbSize = Math.max(10, opts.thumbSize ?? 12)
    this.trackThickness = Math.max(3, opts.trackThickness ?? 4)
  }

  private interactive() {
    return this.activeValue && !this.disabledValue
  }

  private normalizedValue() {
    const min = this.min
    const max = this.max
    if (max <= min) return 0
    return clamp((this.value - min) / (max - min), 0, 1)
  }

  private thumbRect() {
    const r = this.rectValue
    const t = this.thumbSize
    const n = this.normalizedValue()
    if (this.axis === "y") {
      const span = Math.max(0, r.h - t)
      const y = r.y + (1 - n) * span
      return { x: r.x + (r.w - t) / 2, y, w: t, h: t }
    }
    const span = Math.max(0, r.w - t)
    const x = r.x + n * span
    return { x, y: r.y + (r.h - t) / 2, w: t, h: t }
  }

  private setByPointer(point: Vec2) {
    const min = this.min
    const max = this.max
    if (max <= min) {
      this.onChange(min)
      return
    }
    const r = this.rectValue
    const t = this.thumbSize
    const span = this.axis === "y" ? Math.max(0, r.h - t) : Math.max(0, r.w - t)
    const offset = this.axis === "y"
      ? clamp(point.y - r.y - t / 2, 0, span)
      : clamp(point.x - r.x - t / 2, 0, span)
    const ratio = span <= 0 ? 0 : offset / span
    const next = this.axis === "y"
      ? max - ratio * (max - min)
      : min + ratio * (max - min)
    this.onChange(clamp(next, min, max))
    this.invalidateSelf({ pad: 12 })
  }

  protected onDraw(ctx: CanvasRenderingContext2D) {
    if (!this.activeValue) return
    const r = this.rectValue
    const thumb = this.thumbRect()
    const cy = r.y + r.h / 2
    const cx = r.x + r.w / 2
    const trackColor = this.disabledValue
      ? theme.colors.white08
      : this.dragging
        ? theme.colors.white18
        : this.hover
          ? theme.colors.white14
          : theme.colors.white10
    const fillColor = this.disabledValue ? theme.colors.sliderFillDisabled : theme.colors.sliderFill
    const thumbColor = this.disabledValue
      ? theme.colors.controlDisabled
      : this.dragging
        ? theme.colors.controlPressed
        : this.hover
          ? theme.colors.controlHover
          : theme.colors.controlActive
    const thumbStroke = this.disabledValue ? theme.colors.white12 : theme.colors.appBg46

    if (this.axis === "y") {
      const x = cx
      draw(
        ctx,
        LineOp({ x, y: r.y + this.thumbSize / 2 }, { x, y: r.y + r.h - this.thumbSize / 2 }, { color: trackColor, width: this.trackThickness }),
        LineOp({ x, y: thumb.y + thumb.h / 2 }, { x, y: r.y + r.h - this.thumbSize / 2 }, { color: fillColor, width: this.trackThickness }),
        RectOp({ x: thumb.x, y: thumb.y, w: thumb.w, h: thumb.h }, { radius: Math.min(theme.radii.sm, thumb.w / 2), fill: { color: thumbColor }, stroke: { color: thumbStroke, hairline: true } }),
      )
      return
    }

    draw(
      ctx,
      LineOp({ x: r.x + this.thumbSize / 2, y: cy }, { x: r.x + r.w - this.thumbSize / 2, y: cy }, { color: trackColor, width: this.trackThickness }),
      LineOp({ x: r.x + this.thumbSize / 2, y: cy }, { x: thumb.x + thumb.w / 2, y: cy }, { color: fillColor, width: this.trackThickness }),
      RectOp({ x: thumb.x, y: thumb.y, w: thumb.w, h: thumb.h }, { radius: Math.min(theme.radii.sm, thumb.h / 2), fill: { color: thumbColor }, stroke: { color: thumbStroke, hairline: true } }),
    )
  }

  onPointerEnter() {
    if (!this.activeValue) return
    this.hover = true
    this.invalidateSelf({ pad: 12 })
  }

  onPointerLeave() {
    this.hover = false
    if (!this.dragging) this.invalidateSelf({ pad: 12 })
  }

  onPointerDown(e: PointerUIEvent) {
    if (!this.interactive()) return
    if (e.button !== 0) return
    this.dragging = true
    this.setByPointer({ x: e.x, y: e.y })
    e.capture()
    e.handle()
  }

  onPointerMove(e: PointerUIEvent) {
    if (!this.dragging) return
    this.setByPointer({ x: e.x, y: e.y })
    e.handle()
  }

  onPointerUp(e: PointerUIEvent) {
    if (!this.dragging) return
    this.dragging = false
    if (this.interactive()) this.setByPointer({ x: e.x, y: e.y })
    this.invalidateSelf({ pad: 12 })
    e.handle()
  }

  onPointerCancel() {
    if (!this.dragging) return
    this.dragging = false
    this.invalidateSelf({ pad: 12 })
  }
}

type SliderState = {
  widget: Slider
  rect: Rect
  active: boolean
  disabled: boolean
}

export const sliderDescriptor: WidgetDescriptor<SliderState, { min: number; max: number; value: number; onChange?: (next: number) => void; disabled?: boolean }> = {
  id: "slider",
  initialZIndex: 20,
  create: () => {
    const state = { rect: ZERO_RECT, active: false, disabled: false } as SliderState
    state.widget = new Slider({
      rect: () => state.rect,
      value: () => 0,
      onChange: () => {},
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
      rect: () => state.rect,
      min: props.min,
      max: props.max,
      value: () => props.value,
      onChange: props.onChange ?? (() => {}),
      active: () => state.active,
      disabled: () => state.disabled,
    })
  },
}
