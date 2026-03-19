import { clamp, type Rect, type Vec2 } from "../draw"
import type { ControlState } from "./control"
import { drawSliderVisual } from "./draw_controls"
import type { VisualAppearance, VisualStyleInput } from "./visual"

export type SliderAxis = "x" | "y"

export type SliderControlProps = {
  axis?: SliderAxis
  min: number
  max: number
  value: number
  thumbSize?: number
  trackThickness?: number
  appearance?: VisualAppearance
  visualStyle?: VisualStyleInput
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
  drawSliderVisual(ctx, rect, props, state, state.disabled)
}
