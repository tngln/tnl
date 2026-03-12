export type LayerOptions = {
  blendMode?: GlobalCompositeOperation
  opacity?: number
}

import { createLayerCanvas, getCanvas2DContext, type Any2DContext, type AnyCanvas } from "../../platform/web/canvas"
import type { Rect } from "../../core/rect"

type Layer = {
  id: string
  canvas: AnyCanvas
  ctx: Any2DContext
  wCss: number
  hCss: number
  dpr: number
  renderedFrame: number
}

export type DebugLayerTag = {
  surfaceId?: string
  viewportRect?: Rect
}

export type DebugLayerInfo = {
  id: string
  wCss: number
  hCss: number
  dpr: number
  wPx: number
  hPx: number
  canvasType: "offscreen" | "dom"
  renderedFrame: number
  estimatedBytes: number
  tag?: DebugLayerTag
}

export type DebugBlitInfo = {
  frameId: number
  layerId: string
  dest: Rect
  opacity: number
  blendMode: GlobalCompositeOperation
}

export class Compositor {
  private layers = new Map<string, Layer>()
  private main: CanvasRenderingContext2D | null = null
  private frame = 0
  private debugTags = new Map<string, DebugLayerTag>()
  private debugFrameBlits: DebugBlitInfo[] = []

  beginFrame(main: CanvasRenderingContext2D, frameId: number) {
    this.main = main
    this.frame = frameId
    this.debugFrameBlits = []
  }

  private ensureLayer(id: string, wCss: number, hCss: number, dpr: number) {
    const w = Math.max(1, Math.floor(wCss * dpr))
    const h = Math.max(1, Math.floor(hCss * dpr))
    const cur = this.layers.get(id)
    if (cur && cur.canvas.width === w && cur.canvas.height === h && cur.dpr === dpr && cur.wCss === wCss && cur.hCss === hCss) return cur
    const canvas = cur?.canvas ?? createLayerCanvas(w, h)
    canvas.width = w
    canvas.height = h
    const ctx = cur?.ctx ?? getCanvas2DContext(canvas)
    const next: Layer = { id, canvas, ctx, wCss, hCss, dpr, renderedFrame: -1 }
    this.layers.set(id, next)
    return next
  }

  withLayer(id: string, wCss: number, hCss: number, dpr: number, render: (ctx: Any2DContext) => void) {
    const layer = this.ensureLayer(id, wCss, hCss, dpr)
    if (layer.renderedFrame !== this.frame) {
      layer.renderedFrame = this.frame
      layer.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      layer.ctx.clearRect(0, 0, wCss, hCss)
      render(layer.ctx)
    }
    return layer
  }

  debugTagLayer(id: string, tag: DebugLayerTag) {
    const prev = this.debugTags.get(id) ?? {}
    this.debugTags.set(id, { ...prev, ...tag })
  }

  debugListLayers(): DebugLayerInfo[] {
    const out: DebugLayerInfo[] = []
    for (const layer of this.layers.values()) {
      const wPx = Math.max(0, layer.canvas.width)
      const hPx = Math.max(0, layer.canvas.height)
      const canvasType = typeof OffscreenCanvas !== "undefined" && layer.canvas instanceof OffscreenCanvas ? "offscreen" : "dom"
      out.push({
        id: layer.id,
        wCss: layer.wCss,
        hCss: layer.hCss,
        dpr: layer.dpr,
        wPx,
        hPx,
        canvasType,
        renderedFrame: layer.renderedFrame,
        estimatedBytes: wPx * hPx * 4,
        tag: this.debugTags.get(layer.id),
      })
    }
    out.sort((a, b) => a.id.localeCompare(b.id))
    return out
  }

  debugGetFrameBlits() {
    return this.debugFrameBlits.slice()
  }

  blit(layerId: string, dest: { x: number; y: number; w: number; h: number }, opts: LayerOptions = {}) {
    const main = this.main
    if (!main) return
    const layer = this.layers.get(layerId)
    if (!layer) return
    this.debugFrameBlits.push({
      frameId: this.frame,
      layerId,
      dest,
      opacity: opts.opacity ?? 1,
      blendMode: opts.blendMode ?? "source-over",
    })
    main.save()
    main.globalCompositeOperation = opts.blendMode ?? "source-over"
    main.globalAlpha = opts.opacity ?? 1
    main.drawImage(layer.canvas as any, dest.x, dest.y, dest.w, dest.h)
    main.restore()
  }
}
