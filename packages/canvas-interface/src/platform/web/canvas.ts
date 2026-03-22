import { invariant } from "../../errors"

export type AnyCanvas = OffscreenCanvas | HTMLCanvasElement
export type Any2DContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

export function createLayerCanvas(wPx: number, hPx: number): AnyCanvas {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(wPx, hPx)
  if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas")
    canvas.width = wPx
    canvas.height = hPx
    return canvas
  }
  invariant(false, { domain: "platform", code: "CanvasUnavailable", message: "Canvas is not available in this environment" })
}

export function getCanvas2DContext(canvas: AnyCanvas, opts: CanvasRenderingContext2DSettings = { alpha: true, desynchronized: true }) {
  const ctx = canvas.getContext("2d", opts as any)
  invariant(ctx, { domain: "platform", code: "Canvas2DUnavailable", message: "2D context not available" })
  return ctx as Any2DContext
}

export function createMeasureContext(): Any2DContext | null {
  if (typeof OffscreenCanvas !== "undefined") {
    const canvas = new OffscreenCanvas(2, 2)
    const ctx = canvas.getContext("2d", { alpha: true })
    if (ctx) return ctx as OffscreenCanvasRenderingContext2D
  }
  if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas")
    const ctx = canvas.getContext("2d", { alpha: true })
    if (ctx) return ctx
  }
  return null
}

export function getClampedDevicePixelRatio(min = 1, max = 3) {
  const dpr = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1
  return Math.max(min, Math.min(max, dpr))
}
