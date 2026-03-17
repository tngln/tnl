import { clamp, type Rect } from "../draw"

export type FloatingPlacement = "bottom-start" | "top-start" | "right-start" | "left-start"

export function placeFloatingRect(opts: {
  viewport: Rect
  anchor: Rect
  size: { w: number; h: number }
  placement: FloatingPlacement
  offset?: number
  pad?: number
}) {
  const vp = opts.viewport
  const a = opts.anchor
  const w = Math.max(0, opts.size.w)
  const h = Math.max(0, opts.size.h)
  const offset = opts.offset ?? 2
  const pad = opts.pad ?? 8

  const clampX = (x: number) => clamp(x, vp.x + pad, vp.x + vp.w - pad - w)
  const clampY = (y: number) => clamp(y, vp.y + pad, vp.y + vp.h - pad - h)

  const place = (placement: FloatingPlacement) => {
    switch (placement) {
      case "bottom-start":
        return { x: a.x, y: a.y + a.h + offset }
      case "top-start":
        return { x: a.x, y: a.y - offset - h }
      case "right-start":
        return { x: a.x + a.w + offset, y: a.y }
      case "left-start":
        return { x: a.x - offset - w, y: a.y }
    }
  }

  const flip = (placement: FloatingPlacement): FloatingPlacement => {
    switch (placement) {
      case "bottom-start":
        return "top-start"
      case "top-start":
        return "bottom-start"
      case "right-start":
        return "left-start"
      case "left-start":
        return "right-start"
    }
  }

  const fits = (x: number, y: number) => {
    if (w <= 0 || h <= 0) return true
    const left = x
    const right = x + w
    const top = y
    const bottom = y + h
    return left >= vp.x + pad && right <= vp.x + vp.w - pad && top >= vp.y + pad && bottom <= vp.y + vp.h - pad
  }

  let p = place(opts.placement)
  if (!fits(p.x, p.y)) {
    const alt = place(flip(opts.placement))
    if (fits(alt.x, alt.y)) p = alt
  }

  const x = clampX(p.x)
  const y = clampY(p.y)
  return { x, y, w, h }
}
