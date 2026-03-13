import type { Shape } from "@/core/draw"
import type { Circle } from "@/core/geometry"
import { clamp } from "@/core/rect"
import type { Rect, Vec2 } from "@/core/rect"

export function pointInRect(p: Vec2, r: Rect) {
  return p.x >= r.x && p.y >= r.y && p.x <= r.x + r.w && p.y <= r.y + r.h
}

export function pointInRoundedRect(p: Vec2, rect: Rect, radius?: number) {
  if (!pointInRect(p, rect)) return false
  const r = clamp(radius ?? 0, 0, Math.min(rect.w, rect.h) / 2)
  if (r <= 0) return true

  const x0 = rect.x
  const y0 = rect.y
  const x1 = rect.x + rect.w
  const y1 = rect.y + rect.h

  if (p.x >= x0 + r && p.x <= x1 - r) return true
  if (p.y >= y0 + r && p.y <= y1 - r) return true

  const cx = p.x < x0 + r ? x0 + r : x1 - r
  const cy = p.y < y0 + r ? y0 + r : y1 - r
  const dx = p.x - cx
  const dy = p.y - cy
  return dx * dx + dy * dy <= r * r
}

export function pointInCircle(p: Vec2, c: Circle) {
  const dx = p.x - c.x
  const dy = p.y - c.y
  return dx * dx + dy * dy <= c.r * c.r
}

export function pointInShape(p: Vec2, s: Shape, ctx?: CanvasRenderingContext2D) {
  if (s.hitTest === "path" && ctx) {
    if (s.fillRule) return ctx.isPointInPath(s.path, p.x, p.y, s.fillRule)
    return ctx.isPointInPath(s.path, p.x, p.y)
  }
  return pointInRect(p, s.viewBox)
}
