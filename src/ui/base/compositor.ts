export type LayerOptions = {
  blendMode?: GlobalCompositeOperation
  opacity?: number
}

type Any2DContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

type Layer = {
  id: string
  canvas: OffscreenCanvas | HTMLCanvasElement
  ctx: Any2DContext
  wCss: number
  hCss: number
  dpr: number
  renderedFrame: number
}

function makeCanvas(wPx: number, hPx: number): OffscreenCanvas | HTMLCanvasElement {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(wPx, hPx)
  const c = document.createElement("canvas")
  c.width = wPx
  c.height = hPx
  return c
}

function get2d(c: OffscreenCanvas | HTMLCanvasElement): Any2DContext {
  const ctx = c.getContext("2d", { alpha: true, desynchronized: true } as any)
  if (!ctx) throw new Error("2D context not available")
  return ctx as Any2DContext
}

export class Compositor {
  private layers = new Map<string, Layer>()
  private main: CanvasRenderingContext2D | null = null
  private frame = 0

  beginFrame(main: CanvasRenderingContext2D, frameId: number) {
    this.main = main
    this.frame = frameId
  }

  private ensureLayer(id: string, wCss: number, hCss: number, dpr: number) {
    const w = Math.max(1, Math.floor(wCss * dpr))
    const h = Math.max(1, Math.floor(hCss * dpr))
    const cur = this.layers.get(id)
    if (cur && cur.canvas.width === w && cur.canvas.height === h && cur.dpr === dpr && cur.wCss === wCss && cur.hCss === hCss) return cur
    const canvas = cur?.canvas ?? makeCanvas(w, h)
    canvas.width = w
    canvas.height = h
    const ctx = cur?.ctx ?? get2d(canvas)
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

  blit(layerId: string, dest: { x: number; y: number; w: number; h: number }, opts: LayerOptions = {}) {
    const main = this.main
    if (!main) return
    const layer = this.layers.get(layerId)
    if (!layer) return
    main.save()
    main.globalCompositeOperation = opts.blendMode ?? "source-over"
    main.globalAlpha = opts.opacity ?? 1
    main.drawImage(layer.canvas as any, dest.x, dest.y, dest.w, dest.h)
    main.restore()
  }
}

