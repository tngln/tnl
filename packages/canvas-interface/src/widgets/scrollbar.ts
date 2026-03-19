import { theme, neutral } from "../theme"
import { draw, RectOp, clamp, ZERO_RECT, type Rect } from "../draw"
import { UIElement, pointInRect } from "../ui_base"
import { useDragHandle } from "../use/use_drag_handle"
import type { WidgetDescriptor } from "../builder/widget_registry"

type Axis = "x" | "y"

type ThumbMetrics = {
  maxValue: number
  trackLength: number
  thumbLength: number
  thumbOffset: number
}

export class Scrollbar extends UIElement {
  private rectValue: () => Rect = () => ZERO_RECT
  private axis: Axis = "y"
  private viewportSize: () => number = () => 0
  private contentSize: () => number = () => 0
  private value: () => number = () => 0
  private onChange: (next: number) => void = () => {}
  private minThumb: number = 20
  private autoHide: boolean = true
  private activeValue: () => boolean = () => true

  private dragOffset = 0
  private readonly drag = useDragHandle(this, {
    enabled: () => !this.hidden(),
    cancelOnLeave: true,
    thresholdSq: 0,
    onPress: ({ current }) => {
      const thumb = this.thumbRect()
      const p = this.axis === "y" ? current.y : current.x
      if (pointInRect(current, thumb)) {
        this.dragOffset = this.axis === "y" ? current.y - thumb.y : current.x - thumb.x
        return
      }
      const thumbLen = this.axis === "y" ? thumb.h : thumb.w
      this.dragOffset = thumbLen / 2
      this.setByPointer(p, this.dragOffset)
    },
    onDragStart: ({ current }) => {
      this.setByPointer(this.axis === "y" ? current.y : current.x, this.dragOffset)
    },
    onDragMove: ({ current }) => {
      this.setByPointer(this.axis === "y" ? current.y : current.x, this.dragOffset)
    },
  })

  constructor(opts: {
    rect: () => Rect
    axis?: Axis
    viewportSize: () => number
    contentSize: () => number
    value: () => number
    onChange: (next: number) => void
    minThumb?: number
    autoHide?: boolean
    active?: () => boolean
  }) {
    super()
    this.update(opts)
    this.setBounds(() => this.rectValue(), () => !this.hidden())
    this.z = 40
  }

  update(opts: {
    rect: () => Rect
    axis?: Axis
    viewportSize: () => number
    contentSize: () => number
    value: () => number
    onChange: (next: number) => void
    minThumb?: number
    autoHide?: boolean
    active?: () => boolean
  }) {
    this.rectValue = opts.rect
    this.axis = opts.axis ?? "y"
    this.viewportSize = opts.viewportSize
    this.contentSize = opts.contentSize
    this.value = opts.value
    this.onChange = opts.onChange
    this.minThumb = Math.max(10, opts.minThumb ?? 20)
    this.autoHide = opts.autoHide ?? true
    this.activeValue = opts.active ?? (() => true)
  }

  private metrics(): ThumbMetrics {
    const r = this.rectValue()
    const viewport = Math.max(0, this.viewportSize())
    const content = Math.max(0, this.contentSize())
    const trackLength = Math.max(0, this.axis === "y" ? r.h : r.w)
    const maxValue = Math.max(0, content - viewport)
    if (trackLength <= 0 || maxValue <= 0 || content <= 0 || viewport <= 0) {
      return { maxValue, trackLength, thumbLength: trackLength, thumbOffset: 0 }
    }
    const thumbLength = clamp((viewport / content) * trackLength, this.minThumb, trackLength)
    const span = Math.max(0, trackLength - thumbLength)
    const value = clamp(this.value(), 0, maxValue)
    const thumbOffset = span <= 0 ? 0 : (value / maxValue) * span
    return { maxValue, trackLength, thumbLength, thumbOffset }
  }

  private hidden() {
    if (!this.activeValue()) return true
    if (!this.autoHide) return false
    return this.metrics().maxValue <= 0
  }

  private thumbRect() {
    const r = this.rectValue()
    const m = this.metrics()
    if (this.axis === "y") return { x: r.x, y: r.y + m.thumbOffset, w: r.w, h: m.thumbLength }
    return { x: r.x + m.thumbOffset, y: r.y, w: m.thumbLength, h: r.h }
  }

  private setByPointer(pointer: number, dragOffset: number) {
    const r = this.rectValue()
    const m = this.metrics()
    if (m.maxValue <= 0) return
    const trackPos = this.axis === "y" ? pointer - r.y : pointer - r.x
    const span = Math.max(0, m.trackLength - m.thumbLength)
    const nextThumb = clamp(trackPos - dragOffset, 0, span)
    const next = span <= 0 ? 0 : (nextThumb / span) * m.maxValue
    this.onChange(next)
  }

  protected onDraw(ctx: CanvasRenderingContext2D) {
    if (this.hidden()) return
    const r = this.rectValue()
    const t = this.thumbRect()
    const active = this.drag.pressed() || this.drag.dragging()
    const track = active ? "rgba(15,23,42,0.82)" : this.hover ? "rgba(15,23,42,0.74)" : "rgba(15,23,42,0.66)"
    const thumb = active ? "rgba(233,237,243,0.92)" : this.hover ? "rgba(233,237,243,0.80)" : "rgba(233,237,243,0.68)"
    const thumbStroke = active ? neutral[100] : neutral[300]
    draw(
      ctx,
      RectOp(
        { x: r.x, y: r.y, w: r.w, h: r.h },
        {
          radius: Math.min(theme.radii.sm, Math.min(r.w, r.h) / 2),
          fill: { paint: track },
          stroke: { color: "rgba(233,237,243,0.18)", hairline: true },
        },
      ),
      RectOp(
        { x: t.x + 1, y: t.y + 1, w: Math.max(0, t.w - 2), h: Math.max(0, t.h - 2) },
        {
          radius: Math.min(theme.radii.sm, Math.min(t.w, t.h) / 2),
          fill: { paint: thumb },
          stroke: { color: thumbStroke, hairline: true },
        },
      ),
    )
  }
}

type ScrollbarStateData = {
  widget: Scrollbar
  rect: Rect
  active: boolean
}

export const scrollbarDescriptor: WidgetDescriptor<ScrollbarStateData, {
  axis?: Axis
  viewportSize: number
  contentSize: number
  value: number
  onChange: (next: number) => void
  minThumb?: number
  autoHide?: boolean
}> = {
  id: "scrollbar",
  initialZIndex: 40,
  create: () => {
    const state = { rect: ZERO_RECT, active: false } as ScrollbarStateData
    state.widget = new Scrollbar({
      rect: () => state.rect,
      viewportSize: () => 0,
      contentSize: () => 0,
      value: () => 0,
      onChange: () => {},
      active: () => state.active,
    })
    return state
  },
  getWidget: (state) => state.widget,
  mount: (state, props, rect, active) => {
    state.rect = rect
    state.active = active
    state.widget.update({
      rect: () => state.rect,
      axis: props.axis,
      viewportSize: () => props.viewportSize,
      contentSize: () => props.contentSize,
      value: () => props.value,
      onChange: props.onChange,
      minThumb: props.minThumb,
      autoHide: props.autoHide,
      active: () => state.active,
    })
  },
}
