import { theme } from "../../config/theme"
import type { Shape } from "../../core/draw"
import { clampRect, inflateRect, intersects, mergeRectInto, normalizeRect, rectArea, unionRect } from "../../core/rect"
import { Compositor } from "./compositor"

export type Vec2 = { x: number; y: number }
export type Rect = { x: number; y: number; w: number; h: number }
export type RRect = { x: number; y: number; w: number; h: number; r: number }
export type Circle = { x: number; y: number; r: number }

export function pointInRect(p: Vec2, r: Rect) {
  return p.x >= r.x && p.y >= r.y && p.x <= r.x + r.w && p.y <= r.y + r.h
}

function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v))
}

export function pointInRRect(p: Vec2, rr: RRect) {
  if (!pointInRect(p, rr)) return false
  const r = clamp(rr.r, 0, Math.min(rr.w, rr.h) / 2)
  if (r <= 0) return true

  const x0 = rr.x
  const y0 = rr.y
  const x1 = rr.x + rr.w
  const y1 = rr.y + rr.h

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

export type PointerLike = {
  pointerId: number
  x: number
  y: number
  button: number
  buttons: number
  altKey: boolean
  ctrlKey: boolean
  shiftKey: boolean
  metaKey: boolean
}

export type WheelLike = {
  x: number
  y: number
  deltaX: number
  deltaY: number
  deltaZ: number
  altKey: boolean
  ctrlKey: boolean
  shiftKey: boolean
  metaKey: boolean
}

export class PointerUIEvent {
  readonly pointerId: number
  readonly x: number
  readonly y: number
  readonly button: number
  readonly buttons: number
  readonly altKey: boolean
  readonly ctrlKey: boolean
  readonly shiftKey: boolean
  readonly metaKey: boolean
  private captured = false

  constructor(e: PointerLike) {
    this.pointerId = e.pointerId
    this.x = e.x
    this.y = e.y
    this.button = e.button
    this.buttons = e.buttons
    this.altKey = e.altKey
    this.ctrlKey = e.ctrlKey
    this.shiftKey = e.shiftKey
    this.metaKey = e.metaKey
  }

  capture() {
    this.captured = true
  }

  get didCapture() {
    return this.captured
  }
}

export class WheelUIEvent {
  readonly x: number
  readonly y: number
  readonly deltaX: number
  readonly deltaY: number
  readonly deltaZ: number
  readonly altKey: boolean
  readonly ctrlKey: boolean
  readonly shiftKey: boolean
  readonly metaKey: boolean
  private handled = false

  constructor(e: WheelLike) {
    this.x = e.x
    this.y = e.y
    this.deltaX = e.deltaX
    this.deltaY = e.deltaY
    this.deltaZ = e.deltaZ
    this.altKey = e.altKey
    this.ctrlKey = e.ctrlKey
    this.shiftKey = e.shiftKey
    this.metaKey = e.metaKey
  }

  handle() {
    this.handled = true
  }

  get didHandle() {
    return this.handled
  }
}

export abstract class UIElement {
  parent: UIElement | null = null
  children: UIElement[] = []
  visible = true
  z = 0
  private rt: { clip?: Rect; compositor?: Compositor; frameId: number; dpr: number } | null = null

  abstract bounds(): Rect
  protected containsPoint(p: Vec2, _ctx?: CanvasRenderingContext2D) {
    return pointInRect(p, this.bounds())
  }

  add(child: UIElement) {
    child.parent = this
    this.children.push(child)
    this.children.sort((a, b) => a.z - b.z)
  }

  remove(child: UIElement) {
    const idx = this.children.indexOf(child)
    if (idx >= 0) this.children.splice(idx, 1)
    child.parent = null
  }

  hitTest(p: Vec2, ctx?: CanvasRenderingContext2D): UIElement | null {
    if (!this.visible) return null
    if (!this.containsPoint(p, ctx)) return null
    for (let i = this.children.length - 1; i >= 0; i--) {
      const hit = this.children[i].hitTest(p, ctx)
      if (hit) return hit
    }
    return this
  }

  bringToFront() {
    if (!this.parent) return
    const siblings = this.parent.children
    const maxZ = siblings.reduce((m, c) => Math.max(m, c.z), 0)
    this.z = maxZ + 1
    siblings.sort((a, b) => a.z - b.z)
  }

  protected renderRuntime() {
    return this.rt
  }

  draw(ctx: CanvasRenderingContext2D, rt?: { clip?: Rect; compositor?: Compositor; frameId: number; dpr: number }) {
    if (!this.visible) return
    this.rt = rt ?? null
    const clip = rt?.clip
    if (clip) {
      const b = this.bounds()
      if (!intersects(b, clip)) return
    }
    this.onDraw(ctx)
    for (const child of this.children) child.draw(ctx, rt)
  }

  protected onDraw(_ctx: CanvasRenderingContext2D) {}

  onPointerDown(_e: PointerUIEvent) {}
  onPointerMove(_e: PointerUIEvent) {}
  onPointerUp(_e: PointerUIEvent) {}
  onWheel(_e: WheelUIEvent) {}
  onPointerEnter() {}
  onPointerLeave() {}
}

export class CanvasUI {
  readonly canvas: HTMLCanvasElement
  readonly ctx: CanvasRenderingContext2D
  readonly root: UIElement
  private rafPending = false
  private capture: UIElement | null = null
  private hover: UIElement | null = null
  private dpr = 1
  private cssW = 1
  private cssH = 1
  private dirty: Rect[] = []
  private dirtyFull = true
  private frameId = 0
  private compositor = new Compositor()

  get sizeCss(): Vec2 {
    return { x: this.cssW, y: this.cssH }
  }

  get devicePixelRatio(): number {
    return this.dpr
  }

  constructor(canvas: HTMLCanvasElement, root: UIElement) {
    this.canvas = canvas
    const ctx = canvas.getContext("2d", { alpha: false, desynchronized: true })
    if (!ctx) throw new Error("2D context not available")
    this.ctx = ctx
    this.root = root

    this.resize()
    window.addEventListener("resize", this.resize)

    canvas.addEventListener("pointerdown", this.onPointerDown)
    canvas.addEventListener("pointermove", this.onPointerMove)
    canvas.addEventListener("pointerup", this.onPointerUp)
    canvas.addEventListener("pointercancel", this.onPointerUp)
    canvas.addEventListener("wheel", this.onWheel, { passive: false })
    canvas.addEventListener("contextmenu", (e) => e.preventDefault())
  }

  destroy() {
    window.removeEventListener("resize", this.resize)
    this.canvas.removeEventListener("pointerdown", this.onPointerDown)
    this.canvas.removeEventListener("pointermove", this.onPointerMove)
    this.canvas.removeEventListener("pointerup", this.onPointerUp)
    this.canvas.removeEventListener("pointercancel", this.onPointerUp)
    this.canvas.removeEventListener("wheel", this.onWheel)
  }

  invalidate() {
    this.dirtyFull = true
    this.dirty = []
    this.scheduleRender()
  }

  invalidateRect(r: Rect, opts: { pad?: number; force?: boolean } = {}) {
    if (opts.force) return this.invalidate()
    const pad = opts.pad ?? 2
    const b = { x: 0, y: 0, w: this.cssW, h: this.cssH }
    const n = normalizeRect(r)
    const inf = inflateRect(n, pad)
    const c = clampRect(inf, b)
    if (!c) return
    if (this.dirtyFull) {
      this.scheduleRender()
      return
    }
    mergeRectInto(this.dirty, c)
    const maxRects = 32
    if (this.dirty.length > maxRects) {
      this.dirtyFull = true
      this.dirty = []
    } else {
      const total = this.dirty.reduce((s, rr) => s + rectArea(rr), 0)
      if (total > 0.4 * rectArea(b)) {
        this.dirtyFull = true
        this.dirty = []
      }
    }
    this.scheduleRender()
  }

  private scheduleRender() {
    if (this.rafPending) return
    this.rafPending = true
    requestAnimationFrame(() => {
      this.rafPending = false
      this.render()
    })
  }

  private resize = () => {
    const rect = this.canvas.getBoundingClientRect()
    const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1))
    this.dpr = dpr
    this.cssW = Math.max(1, rect.width)
    this.cssH = Math.max(1, rect.height)
    const w = Math.max(1, Math.floor(this.cssW * dpr))
    const h = Math.max(1, Math.floor(this.cssH * dpr))
    if (this.canvas.width !== w) this.canvas.width = w
    if (this.canvas.height !== h) this.canvas.height = h
    this.invalidate()
  }

  private toCanvasPoint(e: { clientX: number; clientY: number }): Vec2 {
    const r = this.canvas.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  private toCssWheelDelta(e: WheelEvent): Vec2 {
    let factor = 1
    if (e.deltaMode === 1) factor = 16
    else if (e.deltaMode === 2) factor = Math.max(this.cssH, 1)
    return { x: e.deltaX * factor, y: e.deltaY * factor }
  }

  private render() {
    if (!this.dirtyFull && this.dirty.length === 0) return
    const ctx = this.ctx
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    const frameId = (this.frameId += 1)
    this.compositor.beginFrame(ctx, frameId)

    const full = { x: 0, y: 0, w: this.cssW, h: this.cssH }
    const rects = this.dirtyFull ? [full] : this.dirty.slice()
    this.dirty = []
    this.dirtyFull = false

    for (const r of rects) {
      ctx.save()
      ctx.beginPath()
      ctx.rect(r.x, r.y, r.w, r.h)
      ctx.clip()
      ctx.fillStyle = theme.colors.appBg
      ctx.fillRect(r.x, r.y, r.w, r.h)
      this.root.draw(ctx, { clip: r, compositor: this.compositor, frameId, dpr: this.dpr })
      ctx.restore()
    }
  }

  private onPointerDown = (e: PointerEvent) => {
    this.canvas.setPointerCapture(e.pointerId)
    const p = this.toCanvasPoint(e)
    const target = this.root.hitTest(p, this.ctx)
    if (!target) return
    let top: UIElement = target
    while (top.parent && top.parent !== this.root) top = top.parent
    top.bringToFront()
    const ev = new PointerUIEvent({
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
    const before = top.bounds()
    target.onPointerDown(ev)
    if (ev.didCapture) this.capture = target
    const after = top.bounds()
    this.invalidateRect(unionRect(before, after), { pad: 24 })
  }

  private onPointerMove = (e: PointerEvent) => {
    const p = this.toCanvasPoint(e)
    const over = this.root.hitTest(p, this.ctx)
    if (over !== this.hover) {
      const oldTop = this.hover ? (() => {
        let t: UIElement = this.hover as UIElement
        while (t.parent && t.parent !== this.root) t = t.parent
        return t
      })() : null
      const newTop = over ? (() => {
        let t: UIElement = over as UIElement
        while (t.parent && t.parent !== this.root) t = t.parent
        return t
      })() : null
      this.hover?.onPointerLeave()
      over?.onPointerEnter()
      this.hover = over
      if (oldTop && newTop) this.invalidateRect(unionRect(oldTop.bounds(), newTop.bounds()), { pad: 8 })
      else if (oldTop) this.invalidateRect(oldTop.bounds(), { pad: 8 })
      else if (newTop) this.invalidateRect(newTop.bounds(), { pad: 8 })
    }
    const target = this.capture ?? over
    if (!target) return
    const ev = new PointerUIEvent({
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
    target.onPointerMove(ev)
    let top: UIElement | null = target
    while (top && top.parent && top.parent !== this.root) top = top.parent
    if (top) this.invalidateRect(top.bounds(), { pad: 8 })
  }

  private onPointerUp = (e: PointerEvent) => {
    const p = this.toCanvasPoint(e)
    const target = this.capture ?? this.root.hitTest(p, this.ctx)
    if (!target) return
    const ev = new PointerUIEvent({
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
    let top: UIElement | null = target
    while (top && top.parent && top.parent !== this.root) top = top.parent
    const before = top ? top.bounds() : { x: 0, y: 0, w: 0, h: 0 }
    target.onPointerUp(ev)
    this.capture = null
    const after = top ? top.bounds() : before
    this.invalidateRect(unionRect(before, after), { pad: 24 })
  }

  private onWheel = (e: WheelEvent) => {
    const p = this.toCanvasPoint(e)
    const target = this.root.hitTest(p, this.ctx)
    if (!target) return
    const d = this.toCssWheelDelta(e)
    const ev = new WheelUIEvent({
      x: p.x,
      y: p.y,
      deltaX: d.x,
      deltaY: d.y,
      deltaZ: e.deltaZ,
      altKey: e.altKey,
      ctrlKey: e.ctrlKey,
      shiftKey: e.shiftKey,
      metaKey: e.metaKey,
    })
    target.onWheel(ev)
    if (!ev.didHandle) return
    e.preventDefault()
    let top: UIElement | null = target
    while (top && top.parent && top.parent !== this.root) top = top.parent
    if (top) this.invalidateRect(top.bounds(), { pad: 24 })
  }
}
