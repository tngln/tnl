import { ShapeOp, type DrawOp, type FillStyle, type Rect } from "../draw"
import type { IconDef } from "./types"

export function iconToShape(icon: IconDef, dst: Rect, fill: FillStyle): DrawOp {
  if (typeof Path2D === "undefined") return ShapeOp({ viewBox: dst, path: null as any }, fill)
  const vb = icon.viewBox
  const vbW = Math.max(0, vb.w)
  const vbH = Math.max(0, vb.h)
  const dstW = Math.max(0, dst.w)
  const dstH = Math.max(0, dst.h)
  if (vbW <= 0 || vbH <= 0 || dstW <= 0 || dstH <= 0) return ShapeOp({ viewBox: dst, path: new Path2D() }, fill)

  const scale = Math.min(dstW / vbW, dstH / vbH)
  const contentW = vbW * scale
  const contentH = vbH * scale
  const dx = (dstW - contentW) / 2
  const dy = (dstH - contentH) / 2
  const e = dst.x + dx - vb.x * scale
  const f = dst.y + dy - vb.y * scale

  const base = new Path2D(icon.d)
  const path = new Path2D()
  path.addPath(base, { a: scale, b: 0, c: 0, d: scale, e, f })

  return ShapeOp({ viewBox: dst, path }, fill)
}
