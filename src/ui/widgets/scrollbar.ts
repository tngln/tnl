import { draw, RRect } from "../../core/draw"
import { clamp } from "../../core/rect"
import { theme } from "../../config/theme"
import { PointerUIEvent, UIElement, pointInRect, type Rect, type Vec2 } from "../base/ui"

type Axis = "x" | "y"

type ThumbMetrics = {
  maxValue: number
  trackLength: number
  thumbLength: number
  thumbOffset: number
}

export class Scrollbar extends UIElement {
  private readonly rect: () => Rect
  private readonly axis: Axis
  private readonly viewportSize: () => number
  private readonly contentSize: () => number
  private readonly value: () => number
  private readonly onChange: (next: number) => void
  private readonly minThumb: number
  private readonly active: () => boolean
  private readonly autoHide: boolean

  private hover = false
  private down = false
  private dragOffset = 0

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
    this.rect = opts.rect
    this.axis = opts.axis ?? "y"
    this.viewportSize = opts.viewportSize
    this.contentSize = opts.contentSize
    this.value = opts.value
    this.onChange = opts.onChange
    this.minThumb = Math.max(10, opts.minThumb ?? 20)
    this.autoHide = opts.autoHide ?? true
    this.active = opts.active ?? (() => true)
    this.z = 40
  }

  private metrics(): ThumbMetrics {
    const r = this.rect()
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
    if (!this.active()) return true
    if (!this.autoHide) return false
    return this.metrics().maxValue <= 0
  }

  private thumbRect() {
    const r = this.rect()
    const m = this.metrics()
    if (this.axis === "y") return { x: r.x, y: r.y + m.thumbOffset, w: r.w, h: m.thumbLength }
    return { x: r.x + m.thumbOffset, y: r.y, w: m.thumbLength, h: r.h }
  }

  private setByPointer(pointer: number) {
    const r = this.rect()
    const m = this.metrics()
    if (m.maxValue <= 0) return
    const trackPos = this.axis === "y" ? pointer - r.y : pointer - r.x
    const span = Math.max(0, m.trackLength - m.thumbLength)
    const nextThumb = clamp(trackPos - this.dragOffset, 0, span)
    const next = span <= 0 ? 0 : (nextThumb / span) * m.maxValue
    this.onChange(next)
  }

  bounds(): Rect {
    if (this.hidden()) return { x: 0, y: 0, w: 0, h: 0 }
    return this.rect()
  }

  protected containsPoint(p: Vec2) {
    return pointInRect(p, this.bounds())
  }

  protected onDraw(ctx: CanvasRenderingContext2D) {
    if (this.hidden()) return
    const r = this.rect()
    const t = this.thumbRect()
    const track = this.down ? "rgba(255,255,255,0.07)" : this.hover ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.04)"
    const thumb = this.down ? "rgba(233,237,243,0.46)" : this.hover ? "rgba(233,237,243,0.38)" : "rgba(233,237,243,0.30)"
    draw(
      ctx,
      RRect({ x: r.x, y: r.y, w: r.w, h: r.h, r: Math.min(theme.radii.sm, Math.min(r.w, r.h) / 2) }, { fill: { color: track } }),
      RRect(
        { x: t.x + 1, y: t.y + 1, w: Math.max(0, t.w - 2), h: Math.max(0, t.h - 2), r: Math.min(theme.radii.sm, Math.min(t.w, t.h) / 2) },
        { fill: { color: thumb } },
      ),
    )
  }

  onPointerEnter() {
    this.hover = true
  }

  onPointerLeave() {
    this.hover = false
    this.down = false
  }

  onPointerDown(e: PointerUIEvent) {
    if (this.hidden()) return
    if (e.button !== 0) return
    const thumb = this.thumbRect()
    const p = this.axis === "y" ? e.y : e.x
    if (pointInRect({ x: e.x, y: e.y }, thumb)) {
      this.dragOffset = this.axis === "y" ? e.y - thumb.y : e.x - thumb.x
    } else {
      const thumbLen = this.axis === "y" ? thumb.h : thumb.w
      this.dragOffset = thumbLen / 2
      this.setByPointer(p)
    }
    this.down = true
    e.capture()
  }

  onPointerMove(e: PointerUIEvent) {
    if (!this.down) return
    this.setByPointer(this.axis === "y" ? e.y : e.x)
  }

  onPointerUp(_e: PointerUIEvent) {
    this.down = false
  }
}
