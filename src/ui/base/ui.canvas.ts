import { theme } from "@/config/theme"
import type { InteractionCancelReason } from "@/core/event_stream"
import { clampRect, inflateRect, intersects, mergeRectInto, normalizeRect, rectArea, unionRect, ZERO_RECT } from "@/core/rect"
import type { Rect, Vec2 } from "@/core/rect"
import {
  addBrowserInteractionCancelListener,
  addLostPointerCaptureListener,
  addWindowResizeListener,
  getClampedDevicePixelRatio,
  releaseElementPointerCapture,
  resetElementCursor,
  scheduleAnimationFrame,
  setElementCursor,
  setElementPointerCapture,
  type CursorKind,
} from "@/platform/web"
import { Compositor } from "./compositor"
import { dispatchKeyEvent, dispatchPointerCancelEvent, dispatchPointerEvent, dispatchWheelEvent } from "./ui.dispatch"
import { KeyUIEvent, type KeyLike, PointerUIEvent, WheelUIEvent } from "./ui.events"
import { UIElement } from "./ui.element"
import { pointInRect } from "./ui.hit_test"

export class CanvasUI {
  readonly canvas: HTMLCanvasElement
  readonly ctx: CanvasRenderingContext2D
  readonly root: UIElement
  private rafPending = false
  private capture: UIElement | null = null
  private hover: UIElement | null = null
  private focus: UIElement | null = null
  private activePointerId: number | null = null
  private dpr = 1
  private cssW = 1
  private cssH = 1
  private dirty: Rect[] = []
  private dirtyFull = true
  private frameId = 0
  private compositor = new Compositor()
  private debugOverlay: Rect | null = null
  private readonly onTopLevelPointerDown?: (top: UIElement, target: UIElement) => void
  private readonly removeResizeListener: () => void
  private readonly removeLostPointerCaptureListener: () => void
  private readonly removeBrowserInteractionCancelListener: () => void
  private cursor: CursorKind = "default"

  get sizeCss(): Vec2 {
    return { x: this.cssW, y: this.cssH }
  }

  get devicePixelRatio(): number {
    return this.dpr
  }

  get hoverTarget() {
    return this.hover
  }

  get captureTarget() {
    return this.capture
  }

  get focusTarget() {
    return this.focus
  }

  get hoverTopLevelTarget() {
    return this.hover ? this.topLevelTargetOf(this.hover) : null
  }

  get captureTopLevelTarget() {
    return this.capture ? this.topLevelTargetOf(this.capture) : null
  }

  get focusTopLevelTarget() {
    return this.focus ? this.topLevelTargetOf(this.focus) : null
  }

  constructor(canvas: HTMLCanvasElement, root: UIElement, opts: { onTopLevelPointerDown?: (top: UIElement, target: UIElement) => void } = {}) {
    this.canvas = canvas
    const ctx = canvas.getContext("2d", { alpha: false, desynchronized: true })
    if (!ctx) throw new Error("2D context not available")
    this.ctx = ctx
    this.root = root
    this.onTopLevelPointerDown = opts.onTopLevelPointerDown

    this.resize()
    this.removeResizeListener = addWindowResizeListener(this.resize)
    this.removeLostPointerCaptureListener = addLostPointerCaptureListener(canvas, (pointerId) => {
      if (this.activePointerId !== pointerId) return
      this.cancelPointerSession("lost-capture")
    })
    this.removeBrowserInteractionCancelListener = addBrowserInteractionCancelListener((reason) => {
      this.cancelPointerSession(reason)
      this.clearFocus()
    })

    canvas.addEventListener("pointerdown", this.onPointerDown)
    canvas.addEventListener("pointermove", this.onPointerMove)
    canvas.addEventListener("pointerup", this.onPointerUp)
    canvas.addEventListener("pointercancel", this.onPointerCancel)
    canvas.addEventListener("wheel", this.onWheel, { passive: false })
    canvas.addEventListener("contextmenu", (e) => e.preventDefault())
  }

  destroy() {
    this.removeResizeListener()
    this.removeLostPointerCaptureListener()
    this.removeBrowserInteractionCancelListener()
    this.canvas.removeEventListener("pointerdown", this.onPointerDown)
    this.canvas.removeEventListener("pointermove", this.onPointerMove)
    this.canvas.removeEventListener("pointerup", this.onPointerUp)
    this.canvas.removeEventListener("pointercancel", this.onPointerCancel)
    this.canvas.removeEventListener("wheel", this.onWheel)
    this.releasePointerCapture()
    this.clearFocus()
    this.applyCursor("default")
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

  setDebugOverlay(rect: Rect | null) {
    const prev = this.debugOverlay
    this.debugOverlay = rect
    if (prev && rect) this.invalidateRect(unionRect(prev, rect), { pad: 12 })
    else if (prev) this.invalidateRect(prev, { pad: 12 })
    else if (rect) this.invalidateRect(rect, { pad: 12 })
  }

  debugCompositorLayers() {
    return this.compositor.debugListLayers()
  }

  debugCompositorFrameBlits() {
    return this.compositor.debugGetFrameBlits()
  }

  private scheduleRender() {
    if (this.rafPending) return
    this.rafPending = true
    scheduleAnimationFrame(() => {
      this.rafPending = false
      this.render()
    })
  }

  private resize = () => {
    const rect = this.canvas.getBoundingClientRect()
    const dpr = getClampedDevicePixelRatio(1, 3)
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
      this.root.draw(ctx, { clip: r, compositor: this.compositor, frameId, dpr: this.dpr, invalidateRect: (rect, opts) => this.invalidateRect(rect, opts) })
      const overlay = this.debugOverlay
      if (overlay && intersects(overlay, r)) {
        ctx.save()
        ctx.globalAlpha = 1
        ctx.fillStyle = theme.colors.accentOverlay
        ctx.strokeStyle = theme.colors.accentOutlineStrong
        ctx.lineWidth = 1
        ctx.fillRect(overlay.x, overlay.y, overlay.w, overlay.h)
        ctx.strokeRect(overlay.x + 0.5, overlay.y + 0.5, Math.max(0, overlay.w - 1), Math.max(0, overlay.h - 1))
        ctx.restore()
      }
      ctx.restore()
    }
  }

  private releasePointerCapture() {
    if (this.activePointerId === null) return
    releaseElementPointerCapture(this.canvas, this.activePointerId)
    this.activePointerId = null
  }

  private pointerUiEventFromNative(e: PointerEvent): PointerUIEvent {
    const p = this.toCanvasPoint(e)
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

  private cancelPointerSession(reason: InteractionCancelReason, nativeEvent?: PointerEvent | null) {
    const target = this.capture
    const oldHover = this.hover
    const topBefore = target ? this.topLevelTargetOf(target) : oldHover ? this.topLevelTargetOf(oldHover) : null
    const before = topBefore?.bounds() ?? null

    if (this.hover) {
      this.hover.onPointerLeave()
      this.hover = null
    }

    if (target) {
      dispatchPointerCancelEvent(target, nativeEvent ? this.pointerUiEventFromNative(nativeEvent) : null, reason)
      this.capture = null
    }

    this.releasePointerCapture()
    this.applyResolvedCursor(nativeEvent ? this.toCanvasPoint(nativeEvent) : null)

    const after = topBefore?.bounds() ?? before
    if (before && after) this.invalidateRect(unionRect(before, after), { pad: 24 })
    else if (before) this.invalidateRect(before, { pad: 24 })
  }

  private onPointerDown = (e: PointerEvent) => {
    const p = this.toCanvasPoint(e)
    const target = this.root.hitTest(p, this.ctx)
    if (!target) return
    this.activePointerId = e.pointerId
    setElementPointerCapture(this.canvas, e.pointerId)
    let top: UIElement = target
    top = this.topLevelTargetOf(top)
    if (this.onTopLevelPointerDown) this.onTopLevelPointerDown(top, target)
    else top.bringToFront()
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
    const dispatch = dispatchPointerEvent(target, ev, "down")
    const focusTarget = dispatch.focusTarget instanceof UIElement ? dispatch.focusTarget : dispatch.target instanceof UIElement ? dispatch.target : target
    this.focusElement(this.resolveFocusableTarget(focusTarget))
    if (dispatch.captureTarget === dispatch.target && target instanceof UIElement) this.capture = target
    this.applyResolvedCursor(p, this.capture ?? target)
    const after = top.bounds()
    this.invalidateRect(unionRect(before, after), { pad: 24 })
  }

  private onPointerMove = (e: PointerEvent) => {
    if (this.capture && this.activePointerId === e.pointerId && (e.buttons & 1) === 0) {
      this.cancelPointerSession("buttons-released", e)
      return
    }
    const p = this.toCanvasPoint(e)
    const over = this.root.hitTest(p, this.ctx)
    if (over !== this.hover) {
      const oldTop = this.hover
        ? (() => {
            return this.topLevelTargetOf(this.hover as UIElement)
          })()
        : null
      const newTop = over
        ? (() => {
            return this.topLevelTargetOf(over as UIElement)
          })()
        : null
      this.hover?.onPointerLeave()
      over?.onPointerEnter()
      this.hover = over
      if (oldTop && newTop) this.invalidateRect(unionRect(oldTop.bounds(), newTop.bounds()), { pad: 8 })
      else if (oldTop) this.invalidateRect(oldTop.bounds(), { pad: 8 })
      else if (newTop) this.invalidateRect(newTop.bounds(), { pad: 8 })
    }
    this.applyResolvedCursor(p)
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
    let topBefore: UIElement | null = target
    if (topBefore) topBefore = this.topLevelTargetOf(topBefore)
    const before = topBefore ? topBefore.bounds() : null
    dispatchPointerEvent(target, ev, "move")
    let topAfter: UIElement | null = target
    if (topAfter) topAfter = this.topLevelTargetOf(topAfter)
    const after = topAfter ? topAfter.bounds() : before
    if (before && after) this.invalidateRect(unionRect(before, after), { pad: 24 })
    else if (after) this.invalidateRect(after, { pad: 24 })
  }

  private onPointerUp = (e: PointerEvent) => {
    const p = this.toCanvasPoint(e)
    const target = this.capture ?? this.root.hitTest(p, this.ctx)
    if (!target) {
      this.capture = null
      this.releasePointerCapture()
      return
    }
    const ev = this.pointerUiEventFromNative(e)
    let top: UIElement | null = target
    if (top) top = this.topLevelTargetOf(top)
    const before = top ? top.bounds() : ZERO_RECT
    dispatchPointerEvent(target, ev, "up")
    this.capture = null
    this.releasePointerCapture()
    this.applyResolvedCursor(p)
    const after = top ? top.bounds() : before
    this.invalidateRect(unionRect(before, after), { pad: 24 })
  }

  private onPointerCancel = (e: PointerEvent) => {
    this.cancelPointerSession("pointercancel", e)
  }

  focusElement(target: UIElement | null) {
    if (this.focus === target) return
    const previous = this.focus
    this.focus = target
    previous?.onBlur()
    target?.onFocus()
  }

  clearFocus() {
    this.focusElement(null)
  }

  handleKeyDown(e: KeyLike) {
    if (!this.focus) return { consumed: false, preventDefault: false }
    const ev = new KeyUIEvent(e)
    dispatchKeyEvent(this.focus, ev, "down")
    return { consumed: ev.didConsume, preventDefault: ev.didPreventDefault }
  }

  handleKeyUp(e: KeyLike) {
    if (!this.focus) return { consumed: false, preventDefault: false }
    const ev = new KeyUIEvent(e)
    dispatchKeyEvent(this.focus, ev, "up")
    return { consumed: ev.didConsume, preventDefault: ev.didPreventDefault }
  }

  private applyCursor(next: CursorKind) {
    if (this.cursor === next) return
    this.cursor = next
    if (next === "default") resetElementCursor(this.canvas)
    else setElementCursor(this.canvas, next)
  }

  private resolveCursor(p: Vec2 | null, targetOverride?: UIElement | null): CursorKind {
    const target = targetOverride ?? this.capture ?? this.hover
    if (target) {
      let top: UIElement = target
      top = this.topLevelTargetOf(top)
      const cursor = p ? top.cursorAt(p, this.ctx) : null
      if (cursor) return cursor
      if (p && pointInRect(p, top.bounds())) return "default"
      if (this.capture && targetOverride === undefined) return this.capture.captureCursor() ?? "default"
    }
    if (p) {
      const cursor = this.root.cursorAt(p, this.ctx)
      if (cursor) return cursor
    }
    return "default"
  }

  private topLevelTargetOf(target: UIElement) {
    let top = target
    while (top.parent && top.parent !== this.root) top = top.parent
    return top
  }

  private resolveFocusableTarget(target: UIElement | null) {
    let current = target
    while (current) {
      if (current.canFocus()) return current
      current = current.parent
    }
    return null
  }

  private applyResolvedCursor(p: Vec2 | null, targetOverride?: UIElement | null) {
    this.applyCursor(this.resolveCursor(p, targetOverride))
  }

  private onWheel = (e: WheelEvent) => {
    if (e.ctrlKey || e.metaKey) e.preventDefault()
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
    dispatchWheelEvent(target, ev)
    if (!ev.didHandle) return
    e.preventDefault()
    let top: UIElement | null = target
    while (top && top.parent && top.parent !== this.root) top = top.parent
    if (top) this.invalidateRect(top.bounds(), { pad: 24 })
  }
}
