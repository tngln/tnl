import type { Circle, Rect, RRect, Vec2 } from "./geometry"

export type ShapeHitTest = "viewBox" | "path"

export type Shape = {
  viewBox: Rect
  path: Path2D
  hitTest?: ShapeHitTest
  fillRule?: CanvasFillRule
}

export type FillStyle = {
  color: string
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
  | { kind: "Rect"; rect: Rect; fill?: FillStyle; stroke?: StrokeStyle; pixelSnap?: boolean }
  | { kind: "RRect"; rrect: RRect; fill?: FillStyle; stroke?: StrokeStyle; pixelSnap?: boolean }
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

function applyFillStyle(ctx: CanvasRenderingContext2D, style: FillStyle) {
  ctx.fillStyle = style.color
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

function snappedRRect(ctx: CanvasRenderingContext2D, rr: RRect) {
  const dpr = dprOf(ctx)
  const o = 0.5 / dpr
  return { x: rr.x + o, y: rr.y + o, w: rr.w - 2 * o, h: rr.h - 2 * o, r: rr.r }
}

function rrectPath(ctx: CanvasRenderingContext2D, rr: RRect) {
  ctx.beginPath()
  const r = Math.max(0, Math.min(rr.r, Math.min(rr.w, rr.h) / 2))
  ctx.roundRect(rr.x, rr.y, rr.w, rr.h, r)
}

function fillRectOp(ctx: CanvasRenderingContext2D, rect: Rect, fill: FillStyle) {
  withShadow(ctx, fill.shadow, () => {
    applyFillStyle(ctx, fill)
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h)
  })
}

function strokeRectOp(ctx: CanvasRenderingContext2D, rect: Rect, stroke: StrokeStyle) {
  withShadow(ctx, stroke.shadow, () => {
    applyStrokeStyle(ctx, stroke)
    ctx.strokeRect(rect.x, rect.y, rect.w, rect.h)
  })
}

function fillPathOp(ctx: CanvasRenderingContext2D, fill: FillStyle, buildPath: () => void, fillRule?: CanvasFillRule) {
  withShadow(ctx, fill.shadow, () => {
    applyFillStyle(ctx, fill)
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

function fillShapeOp(ctx: CanvasRenderingContext2D, fill: FillStyle, path: Path2D, fillRule?: CanvasFillRule) {
  withShadow(ctx, fill.shadow, () => {
    applyFillStyle(ctx, fill)
    if (fillRule) ctx.fill(path, fillRule)
    else ctx.fill(path)
  })
}

export function draw(ctx: CanvasRenderingContext2D, ...ops: DrawOp[]) {
  for (const op of ops) {
    switch (op.kind) {
      case "Rect": {
        if (op.fill) fillRectOp(ctx, op.rect, op.fill)
        if (op.stroke) strokeRectOp(ctx, op.pixelSnap ? snappedRect(ctx, op.rect) : op.rect, op.stroke)
        break
      }
      case "RRect": {
        if (op.fill) fillPathOp(ctx, op.fill, () => rrectPath(ctx, op.rrect))
        if (op.stroke) strokePathOp(ctx, op.stroke, () => rrectPath(ctx, op.pixelSnap ? snappedRRect(ctx, op.rrect) : op.rrect))
        break
      }
      case "Circle": {
        if (op.fill)
          fillPathOp(ctx, op.fill, () => {
            ctx.beginPath()
            ctx.arc(op.circle.x, op.circle.y, op.circle.r, 0, Math.PI * 2)
          })
        if (op.stroke)
          strokePathOp(ctx, op.stroke, () => {
            ctx.beginPath()
            ctx.arc(op.circle.x, op.circle.y, op.circle.r, 0, Math.PI * 2)
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
        fillShapeOp(ctx, op.fill, op.shape.path, op.shape.fillRule)
        break
      }
    }
  }
}

export function RectOp(rect: Rect, style?: { fill?: FillStyle; stroke?: StrokeStyle; pixelSnap?: boolean }): DrawOp {
  return { kind: "Rect", rect, fill: style?.fill, stroke: style?.stroke, pixelSnap: style?.pixelSnap }
}

export function RRectOp(rrect: RRect, style?: { fill?: FillStyle; stroke?: StrokeStyle; pixelSnap?: boolean }): DrawOp {
  return { kind: "RRect", rrect, fill: style?.fill, stroke: style?.stroke, pixelSnap: style?.pixelSnap }
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
