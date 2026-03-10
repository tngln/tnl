import { draw, Line, RRect } from "../../core/draw"
import { clamp, type Rect } from "../../core/rect"
import { theme } from "../../config/theme"
import { PointerUIEvent, pointInRect, type Vec2 } from "../base/ui"
import { UIElement } from "../base/ui"

type Axis = "x" | "y"

export class Slider extends UIElement {
  private readonly rect: () => Rect
  private readonly axis: Axis
  private readonly min: () => number
  private readonly max: () => number
  private readonly value: () => number
  private readonly onChange: (next: number) => void
  private readonly active: () => boolean
  private readonly disabled: () => boolean
  private readonly thumbSize: number
  private readonly trackThickness: number

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
    const minOpt = opts.min
    const maxOpt = opts.max
    this.rect = opts.rect
    this.axis = opts.axis ?? "x"
    this.min = typeof minOpt === "function" ? minOpt : () => minOpt ?? 0
    this.max = typeof maxOpt === "function" ? maxOpt : () => maxOpt ?? 1
    this.value = opts.value
    this.onChange = opts.onChange
    this.active = opts.active ?? (() => true)
    this.disabled = opts.disabled ?? (() => false)
    this.thumbSize = Math.max(10, opts.thumbSize ?? 12)
    this.trackThickness = Math.max(3, opts.trackThickness ?? 4)
    this.z = 20
  }

  bounds(): Rect {
    if (!this.active()) return { x: 0, y: 0, w: 0, h: 0 }
    return this.rect()
  }

  protected containsPoint(p: Vec2) {
    return this.active() && pointInRect(p, this.bounds())
  }

  private interactive() {
    return this.active() && !this.disabled()
  }

  private normalizedValue() {
    const min = this.min()
    const max = this.max()
    if (max <= min) return 0
    return clamp((this.value() - min) / (max - min), 0, 1)
  }

  private thumbRect() {
    const r = this.rect()
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
    const min = this.min()
    const max = this.max()
    if (max <= min) {
      this.onChange(min)
      return
    }
    const r = this.rect()
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
    if (!this.active()) return
    const r = this.rect()
    const thumb = this.thumbRect()
    const cy = r.y + r.h / 2
    const cx = r.x + r.w / 2
    const trackColor = this.disabled()
      ? "rgba(255,255,255,0.08)"
      : this.dragging
        ? "rgba(255,255,255,0.18)"
        : this.hover
          ? "rgba(255,255,255,0.14)"
          : "rgba(255,255,255,0.10)"
    const fillColor = this.disabled() ? "rgba(145,170,210,0.22)" : "rgba(124,183,255,0.72)"
    const thumbColor = this.disabled()
      ? "rgba(233,237,243,0.30)"
      : this.dragging
        ? "rgba(233,237,243,0.96)"
        : this.hover
          ? "rgba(233,237,243,0.88)"
          : "rgba(233,237,243,0.78)"
    const thumbStroke = this.disabled() ? "rgba(255,255,255,0.12)" : "rgba(11,15,23,0.46)"

    if (this.axis === "y") {
      const x = cx
      draw(
        ctx,
        Line({ x, y: r.y + this.thumbSize / 2 }, { x, y: r.y + r.h - this.thumbSize / 2 }, { color: trackColor, width: this.trackThickness }),
        Line({ x, y: thumb.y + thumb.h / 2 }, { x, y: r.y + r.h - this.thumbSize / 2 }, { color: fillColor, width: this.trackThickness }),
        RRect({ x: thumb.x, y: thumb.y, w: thumb.w, h: thumb.h, r: Math.min(theme.radii.sm, thumb.w / 2) }, { fill: { color: thumbColor }, stroke: { color: thumbStroke, hairline: true }, pixelSnap: true }),
      )
      return
    }

    draw(
      ctx,
      Line({ x: r.x + this.thumbSize / 2, y: cy }, { x: r.x + r.w - this.thumbSize / 2, y: cy }, { color: trackColor, width: this.trackThickness }),
      Line({ x: r.x + this.thumbSize / 2, y: cy }, { x: thumb.x + thumb.w / 2, y: cy }, { color: fillColor, width: this.trackThickness }),
      RRect({ x: thumb.x, y: thumb.y, w: thumb.w, h: thumb.h, r: Math.min(theme.radii.sm, thumb.h / 2) }, { fill: { color: thumbColor }, stroke: { color: thumbStroke, hairline: true }, pixelSnap: true }),
    )
  }

  onPointerEnter() {
    if (!this.active()) return
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