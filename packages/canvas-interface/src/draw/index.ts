import type { Circle, Rect, Vec2 } from "./geometry"

export * from "../text/rich"
export * from "./geometry"
export * from "./rect"

export type ShapeHitTest = "viewBox" | "path"

export type Shape = {
  viewBox: Rect
  path: Path2D
  hitTest?: ShapeHitTest
  fillRule?: CanvasFillRule
}

export type GradientStop = { offset: number; color: string }

export type LinearGradientDef = { kind: "linear"; x0: number; y0: number; x1: number; y1: number; stops: GradientStop[] }
export type RadialGradientDef = { kind: "radial"; x0: number; y0: number; r0: number; x1: number; y1: number; r1: number; stops: GradientStop[] }
export type ConicGradientDef = { kind: "conic"; angle: number; cx: number; cy: number; stops: GradientStop[] }

export type GradientDef = LinearGradientDef | RadialGradientDef | ConicGradientDef
export type Paint = string | GradientDef

export type FillStyle = {
  paint: Paint
  shadow?: ShadowStyle
}

export type StrokeStyle = {
  color: string
  width?: number
  hairline?: boolean
  dash?: number[]
  lineCap?: CanvasLineCap
  lineJoin?: CanvasLineJoin
  shadow?: ShadowStyle
}

export type ShadowStyle = {
  color: string
  blur: number
  offsetX?: number
  offsetY?: number
}

export type TextStyle = {
  color: string
  font: string
  align?: CanvasTextAlign
  baseline?: CanvasTextBaseline
}

export type Text = {
  x: number
  y: number
  text: string
  maxWidth?: number
  style: TextStyle
}

export type DrawOp =
  | { kind: "Rect"; rect: Rect; radius?: number; fill?: FillStyle; stroke?: StrokeStyle }
  | { kind: "Circle"; circle: Circle; fill?: FillStyle; stroke?: StrokeStyle }
  | { kind: "Text"; text: Text }
  | { kind: "Line"; a: Vec2; b: Vec2; stroke: StrokeStyle }
  | { kind: "Shape"; shape: Shape; fill: FillStyle }

function dprOf(ctx: CanvasRenderingContext2D) {
  const t = ctx.getTransform()
  const sx = Math.hypot(t.a, t.b)
  return sx || 1
}

function withShadow<T>(ctx: CanvasRenderingContext2D, shadow: ShadowStyle | undefined, fn: () => T) {
  if (!shadow) return fn()
  const dpr = dprOf(ctx)
  ctx.save()
  ctx.shadowColor = shadow.color
  ctx.shadowBlur = shadow.blur / dpr
  ctx.shadowOffsetX = (shadow.offsetX ?? 0) / dpr
  ctx.shadowOffsetY = (shadow.offsetY ?? 0) / dpr
  const out = fn()
  ctx.restore()
  return out
}

function buildGradient(ctx: CanvasRenderingContext2D, g: GradientDef, bounds: Rect): CanvasGradient {
  const { x, y, w, h } = bounds
  const s = Math.min(w, h)
  let grad: CanvasGradient
  if (g.kind === "linear") {
    grad = ctx.createLinearGradient(x + g.x0 * w, y + g.y0 * h, x + g.x1 * w, y + g.y1 * h)
  } else if (g.kind === "radial") {
    grad = ctx.createRadialGradient(x + g.x0 * w, y + g.y0 * h, g.r0 * s, x + g.x1 * w, y + g.y1 * h, g.r1 * s)
  } else {
    grad = ctx.createConicGradient(g.angle, x + g.cx * w, y + g.cy * h)
  }
  for (const stop of g.stops) grad.addColorStop(stop.offset, stop.color)
  return grad
}

function applyFillStyle(ctx: CanvasRenderingContext2D, style: FillStyle, bounds: Rect) {
  ctx.fillStyle = typeof style.paint === "string" ? style.paint : buildGradient(ctx, style.paint, bounds)
}

function applyStrokeStyle(ctx: CanvasRenderingContext2D, style: StrokeStyle) {
  const dpr = dprOf(ctx)
  const width = style.hairline ? 1 / dpr : (style.width ?? 1)
  ctx.strokeStyle = style.color
  ctx.lineWidth = width
  ctx.lineCap = style.lineCap ?? "butt"
  ctx.lineJoin = style.lineJoin ?? "miter"
  if (style.dash?.length) ctx.setLineDash(style.dash)
  else ctx.setLineDash([])
}

function snappedRect(ctx: CanvasRenderingContext2D, r: Rect) {
  const dpr = dprOf(ctx)
  const o = 0.5 / dpr
  return { x: r.x + o, y: r.y + o, w: r.w - 2 * o, h: r.h - 2 * o }
}

function snappedRoundedRect(ctx: CanvasRenderingContext2D, rect: Rect, radius: number) {
  const dpr = dprOf(ctx)
  const o = 0.5 / dpr
  return { x: rect.x + o, y: rect.y + o, w: rect.w - 2 * o, h: rect.h - 2 * o, radius }
}

function rectPath(ctx: CanvasRenderingContext2D, rect: Rect, radius = 0) {
  ctx.beginPath()
  const r = Math.max(0, Math.min(radius, Math.min(rect.w, rect.h) / 2))
  if (r <= 0) {
    ctx.rect(rect.x, rect.y, rect.w, rect.h)
    return
  }
  ctx.roundRect(rect.x, rect.y, rect.w, rect.h, r)
}

function fillRectOp(ctx: CanvasRenderingContext2D, rect: Rect, fill: FillStyle) {
  withShadow(ctx, fill.shadow, () => {
    applyFillStyle(ctx, fill, rect)
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h)
  })
}

function strokeRectOp(ctx: CanvasRenderingContext2D, rect: Rect, stroke: StrokeStyle) {
  withShadow(ctx, stroke.shadow, () => {
    applyStrokeStyle(ctx, stroke)
    ctx.strokeRect(rect.x, rect.y, rect.w, rect.h)
  })
}

function fillPathOp(ctx: CanvasRenderingContext2D, fill: FillStyle, bounds: Rect, buildPath: () => void, fillRule?: CanvasFillRule) {
  withShadow(ctx, fill.shadow, () => {
    applyFillStyle(ctx, fill, bounds)
    buildPath()
    if (fillRule) ctx.fill(fillRule)
    else ctx.fill()
  })
}

function strokePathOp(ctx: CanvasRenderingContext2D, stroke: StrokeStyle, buildPath: () => void) {
  withShadow(ctx, stroke.shadow, () => {
    applyStrokeStyle(ctx, stroke)
    buildPath()
    ctx.stroke()
  })
}

function fillShapeOp(ctx: CanvasRenderingContext2D, fill: FillStyle, path: Path2D, bounds: Rect, fillRule?: CanvasFillRule) {
  withShadow(ctx, fill.shadow, () => {
    applyFillStyle(ctx, fill, bounds)
    if (fillRule) ctx.fill(path, fillRule)
    else ctx.fill(path)
  })
}

export function draw(ctx: CanvasRenderingContext2D, ...ops: DrawOp[]) {
  for (const op of ops) {
    switch (op.kind) {
      case "Rect": {
        const radius = Math.max(0, op.radius ?? 0)
        if (radius <= 0) {
          if (op.fill) fillRectOp(ctx, op.rect, op.fill)
          if (op.stroke) strokeRectOp(ctx, snappedRect(ctx, op.rect), op.stroke)
          break
        }
        if (op.fill) fillPathOp(ctx, op.fill, op.rect, () => rectPath(ctx, op.rect, radius))
        if (op.stroke) {
          const rounded = snappedRoundedRect(ctx, op.rect, radius)
          strokePathOp(ctx, op.stroke, () => rectPath(ctx, rounded, rounded.radius))
        }
        break
      }
      case "Circle": {
        const c = op.circle
        if (op.fill) {
          const cb = { x: c.x - c.r, y: c.y - c.r, w: 2 * c.r, h: 2 * c.r }
          fillPathOp(ctx, op.fill, cb, () => {
            ctx.beginPath()
            ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2)
          })
        }
        if (op.stroke)
          strokePathOp(ctx, op.stroke, () => {
            ctx.beginPath()
            ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2)
          })
        break
      }
      case "Text": {
        const { text } = op
        const s = text.style
        ctx.fillStyle = s.color
        ctx.font = s.font
        ctx.textAlign = s.align ?? "start"
        ctx.textBaseline = s.baseline ?? "alphabetic"
        if (text.maxWidth === undefined) ctx.fillText(text.text, text.x, text.y)
        else ctx.fillText(text.text, text.x, text.y, text.maxWidth)
        break
      }
      case "Line": {
        const { stroke, a, b } = op
        strokePathOp(ctx, stroke, () => {
          ctx.beginPath()
          ctx.moveTo(a.x, a.y)
          ctx.lineTo(b.x, b.y)
        })
        break
      }
      case "Shape": {
        fillShapeOp(ctx, op.fill, op.shape.path, op.shape.viewBox, op.shape.fillRule)
        break
      }
    }
  }
}

export function RectOp(rect: Rect, style?: { radius?: number; fill?: FillStyle; stroke?: StrokeStyle }): DrawOp {
  return { kind: "Rect", rect, radius: style?.radius, fill: style?.fill, stroke: style?.stroke }
}

export function CircleOp(circle: Circle, style?: { fill?: FillStyle; stroke?: StrokeStyle }): DrawOp {
  return { kind: "Circle", circle, fill: style?.fill, stroke: style?.stroke }
}

export function TextOp(text: Text): DrawOp {
  return { kind: "Text", text }
}

export function LineOp(a: Vec2, b: Vec2, stroke: StrokeStyle): DrawOp {
  return { kind: "Line", a, b, stroke }
}

export function ShapeOp(shape: Shape, fill: FillStyle): DrawOp {
  return { kind: "Shape", shape, fill }
}
