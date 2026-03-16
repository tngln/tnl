import { invalidateAll } from "../invalidate"
import type { InteractionCancelReason } from "@/core/event_stream"
import { ZERO_RECT } from "@/core/rect"
import { Compositor } from "./compositor"
import { PointerUIEvent, UIElement, WheelUIEvent, dispatchPointerCancelEvent, dispatchPointerEvent, dispatchWheelEvent, pointInRect, type DebugTreeNodeSnapshot, type Rect as BoundsRect, type UIElementEventMap, type UIEventTargetNode, type Vec2 } from "./ui"

export class SurfaceRoot extends UIElement {
  bounds(): BoundsRect {
    return { x: -1e9, y: -1e9, w: 2e9, h: 2e9 }
  }
}

export type ViewportOptions = {
  clip?: boolean
  padding?: number
  scroll?: Vec2 | (() => Vec2)
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
  /**
   * Optional content version token. When provided, the compositor layer for this surface is
   * reused across frames without re-invoking `render` as long as the value does not change
   * and the viewport dimensions stay the same. Increment this number whenever the surface
   * content changes. Omit it to use the default per-frame rendering behaviour.
   */
  contentVersion?: number
  compose?: (compositor: Compositor, viewport: ViewportContext) => void
  hitTest?: (pSurface: Vec2, viewport: ViewportContext) => UIElement | null
  onPointerDown?: (e: PointerUIEvent, viewport: ViewportContext) => void
  onPointerMove?: (e: PointerUIEvent, viewport: ViewportContext) => void
  onPointerUp?: (e: PointerUIEvent, viewport: ViewportContext) => void
  onPointerCancel?: (e: PointerUIEvent | null, reason: InteractionCancelReason, viewport: ViewportContext) => void
  onWheel?: (e: WheelUIEvent, viewport: ViewportContext) => void
  debugSnapshot?: (viewport: ViewportContext) => DebugTreeNodeSnapshot
  setInvalidator?: (fn: (() => void) | null) => void
}

export function surfaceDebugSnapshot(surface: Surface, viewport: ViewportContext): DebugTreeNodeSnapshot {
  return (
    surface.debugSnapshot?.(viewport) ?? {
      kind: "surface",
      type: (surface as object).constructor?.name || "Surface",
      label: surface.id,
      id: surface.id,
      bounds: viewport.rect,
      visible: true,
      meta: `${Math.round(viewport.contentRect.w)}x${Math.round(viewport.contentRect.h)}`,
      children: [],
    }
  )
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

  private capture: UIEventTargetNode | null = null
  private hoverChild: UIElement | null = null
  private readonly surfaceBridge: SurfaceEventBridge
  private surfaceInvalidator: (() => void) | null = null

  constructor(opts: { rect: () => BoundsRect; target?: Surface | null; options?: ViewportOptions }) {
    super()
    const scrollOpt = opts.options?.scroll
    this.rect = opts.rect
    this.target = opts.target ?? null
    this.clip = opts.options?.clip ?? true
    this.padding = Math.max(0, opts.options?.padding ?? 0)
    if (typeof scrollOpt === "function") this.scroll = scrollOpt
    else if (scrollOpt) this.scroll = () => scrollOpt
    else this.scroll = () => ({ x: 0, y: 0 })
    this.active = opts.options?.active ?? (() => true)
    this.surfaceBridge = new SurfaceEventBridge(this)
    this.setBounds(this.rect, this.active)

    this.on("pointerleave", () => {
      if (this.hoverChild) this.hoverChild.emit("pointerleave")
      this.hoverChild = null
    })

    this.on("pointerdown", (e: PointerUIEvent) => {
      if (!this.active()) return
      const s = this.target
      if (!s) return
      const { viewport: vp, local } = this.localPointFromPointer(e)
      ;(s as any).lightDismiss?.(local)
      const hit = s.hitTest?.(local, vp) ?? null
      if (hit && hit !== this.hoverChild) {
        this.hoverChild?.emit("pointerleave")
        hit.emit("pointerenter")
        this.hoverChild = hit
      } else if (!hit && this.hoverChild) {
        this.hoverChild.emit("pointerleave")
        this.hoverChild = null
      }

      const target = hit ?? this.surfaceBridge
      const le = toLocalEvent(e, local)
      const dispatch = dispatchPointerEvent(target, le, "down", this.surfacePointForTarget(local))
      le.requestFocus(hit ?? null)
      if (dispatch.captureTarget === dispatch.target) {
        this.capture = target
        e.capturePointer()
      }
      e.adoptOutcome(le)
    })

    this.on("pointermove", (e: PointerUIEvent) => {
      if (!this.active()) return
      const s = this.target
      if (!s) return
      const { viewport: vp, local } = this.localPointFromPointer(e)
      const hit = s.hitTest?.(local, vp) ?? null
      const hoverTarget = hit instanceof UIElement ? hit : null
      if (hoverTarget && hoverTarget !== this.hoverChild) {
        this.hoverChild?.emit("pointerleave")
        hoverTarget.emit("pointerenter")
        this.hoverChild = hoverTarget
      } else if (!hoverTarget && this.hoverChild) {
        this.hoverChild.emit("pointerleave")
        this.hoverChild = null
      }

      const target = this.surfacePathTarget(local, vp)
      if (!target) return
      const le = toLocalEvent(e, local)
      dispatchPointerEvent(target, le, "move", this.surfacePointForTarget(local))
      e.adoptOutcome(le)
    })

    this.on("pointerup", (e: PointerUIEvent) => {
      if (!this.active()) return
      const s = this.target
      if (!s) return
      const { viewport: vp, local } = this.localPointFromPointer(e)
      const target = this.surfacePathTarget(local, vp)
      if (target) {
        const le = toLocalEvent(e, local)
        dispatchPointerEvent(target, le, "up", this.surfacePointForTarget(local))
        e.adoptOutcome(le)
      }
      this.capture = null
    })

    this.on("pointercancel", (payload: { event: PointerUIEvent | null; reason: InteractionCancelReason }) => {
      if (!this.active()) return
      const s = this.target
      if (!s) return
      const target = this.capture ?? this.surfaceBridge
      if (payload.event) {
        const { viewport: _vp, local } = this.localPointFromPointer(payload.event)
        const le = toLocalEvent(payload.event, local)
        dispatchPointerCancelEvent(target, le, payload.reason, this.surfacePointForTarget(local))
        payload.event.adoptOutcome(le)
      } else {
        dispatchPointerCancelEvent(target, null, payload.reason)
      }
      this.capture = null
      if (this.hoverChild) this.hoverChild.emit("pointerleave")
      this.hoverChild = null
    })

    this.on("wheel", (e: WheelUIEvent) => {
      if (!this.active()) return
      const s = this.target
      if (!s) return
      if (!pointInRect({ x: e.x, y: e.y }, this.rect())) return
      const { viewport: vp, local } = this.localPointFromWheel(e)
      const le = toLocalWheelEvent(e, local)
      const target = s.hitTest?.(local, vp) ?? this.surfaceBridge
      dispatchWheelEvent(target, le, this.surfacePointForTarget(local))
      if (!le.didHandle && target !== this.surfaceBridge) this.surfaceBridge.emit("wheel", le)
      e.adoptOutcome(le)
    })
  }

  setTarget(s: Surface | null) {
    this.target?.setInvalidator?.(null)
    this.target = s
    this.target?.setInvalidator?.(this.surfaceInvalidator)
  }

  protected debugDescribe() {
    const rect = this.bounds()
    return {
      kind: "element" as const,
      type: "ViewportElement",
      label: this.target ? `Viewport -> ${this.target.id}` : "Viewport",
      bounds: rect,
      z: this.z,
      visible: this.visible,
      meta: `${Math.round(rect.w)}x${Math.round(rect.h)}`,
    }
  }

  protected debugChildren(): DebugTreeNodeSnapshot[] {
    const children = super.debugChildren()
    if (!this.active() || !this.target) return children
    children.push(surfaceDebugSnapshot(this.target, this.viewportCtx()))
    return children
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

  eventSurface() {
    return this.target
  }

  eventViewportContext() {
    return this.viewportCtx()
  }

  protected onDraw(ctx: CanvasRenderingContext2D) {
    if (!this.active()) return
    const s = this.target
    if (!s) return
    const vp = this.viewportCtx()
    const rt = this.renderRuntime()
    const comp = rt?.compositor
    const nextInvalidator = rt?.invalidateRect
      ? () => rt.invalidateRect!(vp.rect, { pad: 24 })
      : () => invalidateAll()
    if (this.surfaceInvalidator !== nextInvalidator) {
      this.surfaceInvalidator = nextInvalidator
      s.setInvalidator?.(this.surfaceInvalidator)
    }

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
      comp.debugTagLayer(layerId, { surfaceId: s.id, viewportRect: vp.rect })
      comp.withLayer(layerId, vp.rect.w, vp.rect.h, vp.dpr, (lctx) => {
        lctx.save()
        lctx.translate(vp.contentRect.x - vp.scroll.x - vp.rect.x, vp.contentRect.y - vp.scroll.y - vp.rect.y)
        s.render(lctx, vp)
        lctx.restore()
      }, s.contentVersion)
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

  private localPointFromPointer(e: PointerUIEvent) {
    const vp = this.viewportCtx()
    return { viewport: vp, local: vp.toSurface({ x: e.x, y: e.y }) }
  }

  private localPointFromWheel(e: WheelUIEvent) {
    const vp = this.viewportCtx()
    return { viewport: vp, local: vp.toSurface({ x: e.x, y: e.y }) }
  }

  private surfacePathTarget(local: Vec2, vp: ViewportContext) {
    const s = this.target
    if (!s) return null
    return this.capture ?? s.hitTest?.(local, vp) ?? this.surfaceBridge
  }

  private surfacePointForTarget(local: Vec2) {
    return () => local
  }
}

class SurfaceEventBridge implements UIEventTargetNode {
  constructor(private readonly viewport: ViewportElement) {}

  eventParentTarget() {
    return null
  }

  private targetSurface() {
    return this.viewport.eventSurface()
  }

  private viewportCtx() {
    return this.viewport.eventViewportContext()
  }

  emit<K extends keyof UIElementEventMap>(type: K, ...args: UIElementEventMap[K] extends void ? [] : [UIElementEventMap[K]]): void {
    const surface = this.targetSurface()
    if (!surface) return
    const vp = this.viewportCtx()
    switch (type) {
      case "pointerdown": {
        const e = args[0] as PointerUIEvent
        if (e.target !== this) return
        surface.onPointerDown?.(e, vp)
        break
      }
      case "pointermove": {
        const e = args[0] as PointerUIEvent
        if (e.target !== this) return
        surface.onPointerMove?.(e, vp)
        break
      }
      case "pointerup": {
        const e = args[0] as PointerUIEvent
        if (e.target !== this) return
        surface.onPointerUp?.(e, vp)
        break
      }
      case "pointercancel": {
        const payload = args[0] as { event: PointerUIEvent | null; reason: InteractionCancelReason }
        surface.onPointerCancel?.(payload.event, payload.reason, vp)
        break
      }
      case "wheel": {
        const e = args[0] as WheelUIEvent
        if (e.target !== this && e.didHandle) return
        surface.onWheel?.(e, vp)
        break
      }
    }
  }
}
