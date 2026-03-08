import { Compositor } from "./compositor"
import { PointerUIEvent, UIElement, WheelUIEvent, pointInRect, type Rect as BoundsRect, type Vec2 } from "./ui"

export type ViewportOptions = {
  clip?: boolean
  padding?: number
  scroll?: Vec2
  active?: () => boolean
}

export type ViewportContext = {
  rect: BoundsRect
  contentRect: BoundsRect
  clip: boolean
  scroll: Vec2
  toSurface: (pViewport: Vec2) => Vec2
  dpr: number
}

type Any2DContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

export type Surface = {
  id: string
  render: (ctx: Any2DContext, viewport: ViewportContext) => void
  contentSize?: (viewportSize: Vec2) => Vec2
  blendMode?: GlobalCompositeOperation
  opacity?: number
  compose?: (compositor: Compositor, viewport: ViewportContext) => void
  hitTest?: (pSurface: Vec2, viewport: ViewportContext) => UIElement | null
  onPointerDown?: (e: PointerUIEvent, viewport: ViewportContext) => void
  onPointerMove?: (e: PointerUIEvent, viewport: ViewportContext) => void
  onPointerUp?: (e: PointerUIEvent, viewport: ViewportContext) => void
  onWheel?: (e: WheelUIEvent, viewport: ViewportContext) => void
}

function toLocalEvent(e: PointerUIEvent, p: Vec2) {
  return new PointerUIEvent({
    pointerId: e.pointerId,
    x: p.x,
    y: p.y,
    button: e.button,
    buttons: e.buttons,
    altKey: e.altKey,
    ctrlKey: e.ctrlKey,
    shiftKey: e.shiftKey,
    metaKey: e.metaKey,
  })
}

function toLocalWheelEvent(e: WheelUIEvent, p: Vec2) {
  return new WheelUIEvent({
    x: p.x,
    y: p.y,
    deltaX: e.deltaX,
    deltaY: e.deltaY,
    deltaZ: e.deltaZ,
    altKey: e.altKey,
    ctrlKey: e.ctrlKey,
    shiftKey: e.shiftKey,
    metaKey: e.metaKey,
  })
}

export class ViewportElement extends UIElement {
  private readonly rect: () => BoundsRect
  private target: Surface | null = null
  private readonly clip: boolean
  private readonly padding: number
  private readonly scroll: () => Vec2
  private readonly active: () => boolean

  private capture: UIElement | null = null
  private hover: UIElement | null = null

  constructor(opts: { rect: () => BoundsRect; target?: Surface | null; options?: ViewportOptions }) {
    super()
    this.rect = opts.rect
    this.target = opts.target ?? null
    this.clip = opts.options?.clip ?? true
    this.padding = Math.max(0, opts.options?.padding ?? 0)
    this.scroll = opts.options?.scroll ? () => opts.options!.scroll! : () => ({ x: 0, y: 0 })
    this.active = opts.options?.active ?? (() => true)
  }

  setTarget(s: Surface | null) {
    this.target = s
  }

  bounds(): BoundsRect {
    if (!this.active()) return { x: 0, y: 0, w: 0, h: 0 }
    return this.rect()
  }

  private viewportCtx(): ViewportContext {
    const rect = this.rect()
    const pad = this.padding
    const contentRect = { x: rect.x + pad, y: rect.y + pad, w: Math.max(0, rect.w - pad * 2), h: Math.max(0, rect.h - pad * 2) }
    const scroll = this.scroll()
    const rt = this.renderRuntime()
    const dpr = rt?.dpr ?? 1
    return {
      rect,
      contentRect,
      clip: this.clip,
      scroll,
      toSurface: (pViewport) => ({ x: pViewport.x - contentRect.x + scroll.x, y: pViewport.y - contentRect.y + scroll.y }),
      dpr,
    }
  }

  protected onDraw(ctx: CanvasRenderingContext2D) {
    if (!this.active()) return
    const s = this.target
    if (!s) return
    const vp = this.viewportCtx()
    const rt = this.renderRuntime()
    const comp = rt?.compositor

    if (vp.clip) {
      ctx.save()
      ctx.beginPath()
      ctx.rect(vp.rect.x, vp.rect.y, vp.rect.w, vp.rect.h)
      ctx.clip()
    }

    if (comp && s.compose) {
      s.compose(comp, vp)
    } else if (comp) {
      const layerId = `surface:${s.id}`
      comp.withLayer(layerId, vp.rect.w, vp.rect.h, vp.dpr, (lctx) => {
        lctx.save()
        lctx.translate(vp.contentRect.x - vp.scroll.x - vp.rect.x, vp.contentRect.y - vp.scroll.y - vp.rect.y)
        s.render(lctx, vp)
        lctx.restore()
      })
      comp.blit(layerId, { x: vp.rect.x, y: vp.rect.y, w: vp.rect.w, h: vp.rect.h }, { blendMode: s.blendMode, opacity: s.opacity })
    } else {
      ctx.save()
      ctx.translate(vp.contentRect.x - vp.scroll.x, vp.contentRect.y - vp.scroll.y)
      s.render(ctx, vp)
      ctx.restore()
    }

    if (vp.clip) ctx.restore()
  }

  protected containsPoint(p: Vec2) {
    if (!this.active()) return false
    return pointInRect(p, this.rect())
  }

  hitTest(p: Vec2, ctx?: CanvasRenderingContext2D) {
    if (!this.active()) return null
    const r = this.rect()
    if (!pointInRect(p, r)) return null
    const s = this.target
    if (!s) return this
    const vp = this.viewportCtx()
    const local = vp.toSurface(p)
    const hit = s.hitTest?.(local, vp)
    if (hit) return this
    return this
  }

  onPointerLeave() {
    this.capture = null
    if (this.hover) this.hover.onPointerLeave()
    this.hover = null
  }

  onPointerDown(e: PointerUIEvent) {
    if (!this.active()) return
    const s = this.target
    if (!s) return
    const vp = this.viewportCtx()
    const local = vp.toSurface({ x: e.x, y: e.y })
    const le = toLocalEvent(e, local)

    const hit = s.hitTest?.(local, vp)
    if (hit) {
      if (hit !== this.hover) {
        this.hover?.onPointerLeave()
        hit.onPointerEnter()
        this.hover = hit
      }
      this.capture = null
      hit.onPointerDown(le)
      if (le.didCapture) {
        this.capture = hit
        e.capture()
      }
      return
    }

    s.onPointerDown?.(le, vp)
  }

  onPointerMove(e: PointerUIEvent) {
    if (!this.active()) return
    const s = this.target
    if (!s) return
    const vp = this.viewportCtx()
    const local = vp.toSurface({ x: e.x, y: e.y })
    const le = toLocalEvent(e, local)

    const target = this.capture ?? s.hitTest?.(local, vp)
    if (target && target !== this.hover) {
      this.hover?.onPointerLeave()
      target.onPointerEnter()
      this.hover = target
    } else if (!target && this.hover) {
      this.hover.onPointerLeave()
      this.hover = null
    }

    if (target) target.onPointerMove(le)
    else s.onPointerMove?.(le, vp)
  }

  onPointerUp(e: PointerUIEvent) {
    if (!this.active()) return
    const s = this.target
    if (!s) return
    const vp = this.viewportCtx()
    const local = vp.toSurface({ x: e.x, y: e.y })
    const le = toLocalEvent(e, local)

    const target = this.capture ?? s.hitTest?.(local, vp)
    if (target) target.onPointerUp(le)
    else s.onPointerUp?.(le, vp)
    this.capture = null
  }

  onWheel(e: WheelUIEvent) {
    if (!this.active()) return
    const s = this.target
    if (!s) return
    if (!pointInRect({ x: e.x, y: e.y }, this.rect())) return
    const vp = this.viewportCtx()
    const local = vp.toSurface({ x: e.x, y: e.y })
    const le = toLocalWheelEvent(e, local)
    const target = s.hitTest?.(local, vp)
    if (target) target.onWheel(le)
    if (!le.didHandle) s.onWheel?.(le, vp)
    if (le.didHandle) e.handle()
  }
}
