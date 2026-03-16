import { theme, neutral } from "@/config/theme"
import { draw, LineOp, RectOp } from "@/core/draw"
import { clamp, type Rect } from "@/core/rect"
import type { Vec2 } from "@/ui/base/ui"
import type { ControlState } from "./control"

export type SliderAxis = "x" | "y"

export type SliderControlProps = {
  axis?: SliderAxis
  min: number
  max: number
  value: number
  thumbSize?: number
  trackThickness?: number
}

function resolveThumbSize(props: SliderControlProps) {
  return Math.max(10, props.thumbSize ?? 12)
}

function resolveTrackThickness(props: SliderControlProps) {
  return Math.max(3, props.trackThickness ?? 4)
}

function resolveAxis(props: SliderControlProps): SliderAxis {
  return props.axis ?? "x"
}

function resolveNormalizedValue(props: SliderControlProps) {
  if (props.max <= props.min) return 0
  return clamp((props.value - props.min) / (props.max - props.min), 0, 1)
}

export function resolveSliderThumbRect(rect: Rect, props: SliderControlProps): Rect {
  const thumbSize = resolveThumbSize(props)
  const normalized = resolveNormalizedValue(props)
  if (resolveAxis(props) === "y") {
    const span = Math.max(0, rect.h - thumbSize)
    const y = rect.y + (1 - normalized) * span
    return { x: rect.x + (rect.w - thumbSize) / 2, y, w: thumbSize, h: thumbSize }
  }
  const span = Math.max(0, rect.w - thumbSize)
  const x = rect.x + normalized * span
  return { x, y: rect.y + (rect.h - thumbSize) / 2, w: thumbSize, h: thumbSize }
}

export function resolveSliderValueFromPointer(rect: Rect, props: SliderControlProps, point: Vec2) {
  const min = props.min
  const max = props.max
  if (max <= min) return min
  const thumbSize = resolveThumbSize(props)
  const axis = resolveAxis(props)
  const span = axis === "y" ? Math.max(0, rect.h - thumbSize) : Math.max(0, rect.w - thumbSize)
  const offset = axis === "y"
    ? clamp(point.y - rect.y - thumbSize / 2, 0, span)
    : clamp(point.x - rect.x - thumbSize / 2, 0, span)
  const ratio = span <= 0 ? 0 : offset / span
  const next = axis === "y"
    ? max - ratio * (max - min)
    : min + ratio * (max - min)
  return clamp(next, min, max)
}

export function drawSlider(ctx: CanvasRenderingContext2D, rect: Rect, props: SliderControlProps, state: ControlState) {
  const thumb = resolveSliderThumbRect(rect, props)
  const axis = resolveAxis(props)
  const thumbSize = resolveThumbSize(props)
  const trackThickness = resolveTrackThickness(props)
  const dragging = !!state.dragging
  const trackColor = state.disabled
    ? neutral[500]
    : dragging
      ? neutral[200]
      : state.hover
        ? neutral[300]
        : neutral[400]
  const fillColor = state.disabled ? theme.colors.sliderDim : theme.colors.slider
  const thumbColor = state.disabled
    ? theme.colors.disabled
    : dragging
      ? theme.colors.pressed
      : state.hover
        ? theme.colors.hover
        : theme.colors.active
  const thumbStroke = state.disabled ? neutral[400] : neutral[700]

  if (axis === "y") {
    const x = rect.x + rect.w / 2
    draw(
      ctx,
      LineOp({ x, y: rect.y + thumbSize / 2 }, { x, y: rect.y + rect.h - thumbSize / 2 }, { color: trackColor, width: trackThickness }),
      LineOp({ x, y: thumb.y + thumb.h / 2 }, { x, y: rect.y + rect.h - thumbSize / 2 }, { color: fillColor, width: trackThickness }),
      RectOp({ x: thumb.x, y: thumb.y, w: thumb.w, h: thumb.h }, { radius: Math.min(theme.radii.sm, thumb.w / 2), fill: { paint: thumbColor }, stroke: { color: thumbStroke, hairline: true } }),
    )
    return
  }

  const y = rect.y + rect.h / 2
  draw(
    ctx,
    LineOp({ x: rect.x + thumbSize / 2, y }, { x: rect.x + rect.w - thumbSize / 2, y }, { color: trackColor, width: trackThickness }),
    LineOp({ x: rect.x + thumbSize / 2, y }, { x: thumb.x + thumb.w / 2, y }, { color: fillColor, width: trackThickness }),
    RectOp({ x: thumb.x, y: thumb.y, w: thumb.w, h: thumb.h }, { radius: Math.min(theme.radii.sm, thumb.h / 2), fill: { paint: thumbColor }, stroke: { color: thumbStroke, hairline: true } }),
  )
}