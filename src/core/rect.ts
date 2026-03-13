import type { Rect, Vec2 } from "./geometry"

export type { Rect, Vec2 }

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

export function normalizeRect(r: Rect): Rect {
  const x0 = Math.min(r.x, r.x + r.w)
  const x1 = Math.max(r.x, r.x + r.w)
  const y0 = Math.min(r.y, r.y + r.h)
  const y1 = Math.max(r.y, r.y + r.h)
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

export function inflateRect(r: Rect, pad: number): Rect {
  const p = Math.max(0, pad)
  return { x: r.x - p, y: r.y - p, w: r.w + 2 * p, h: r.h + 2 * p }
}

export function clampRect(r: Rect, bounds: Rect): Rect | null {
  const x0 = Math.max(bounds.x, r.x)
  const y0 = Math.max(bounds.y, r.y)
  const x1 = Math.min(bounds.x + bounds.w, r.x + r.w)
  const y1 = Math.min(bounds.y + bounds.h, r.y + r.h)
  const w = x1 - x0
  const h = y1 - y0
  if (w <= 0 || h <= 0) return null
  return { x: x0, y: y0, w, h }
}

export function intersects(a: Rect, b: Rect) {
  return !(a.x + a.w < b.x || b.x + b.w < a.x || a.y + a.h < b.y || b.y + b.h < a.y)
}

export function unionRect(a: Rect, b: Rect): Rect {
  const x0 = Math.min(a.x, b.x)
  const y0 = Math.min(a.y, b.y)
  const x1 = Math.max(a.x + a.w, b.x + b.w)
  const y1 = Math.max(a.y + a.h, b.y + b.h)
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

export function rectArea(r: Rect) {
  return Math.max(0, r.w) * Math.max(0, r.h)
}

export const ZERO_RECT: Rect = Object.freeze({ x: 0, y: 0, w: 0, h: 0 })

export function mergeRectInto(list: Rect[], next: Rect) {
  let r = next
  for (let i = 0; i < list.length; i++) {
    const cur = list[i]
    if (!intersects(cur, r)) continue
    r = unionRect(cur, r)
    list.splice(i, 1)
    i = -1
  }
  list.push(r)
}

/** Normalize a `string | (() => T)` to `() => T`, also handles undefined with a default. */
export function toGetter<T>(value: T | (() => T)): () => T
export function toGetter<T>(value: T | (() => T) | undefined, fallback: T): () => T
export function toGetter<T>(value: T | (() => T) | undefined, fallback?: T): () => T {
  if (typeof value === "function") return value as () => T
  if (value !== undefined) {
    const v = value
    return () => v
  }
  const f = fallback as T
  return () => f
}


