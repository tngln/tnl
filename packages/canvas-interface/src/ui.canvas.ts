import { theme, alpha, neutral } from "@/config/theme"
import { classifySpatialClicks, createEventStream, type InteractionCancelReason } from "./event_stream"
import { clampRect, inflateRect, intersects, mergeRectInto, normalizeRect, rectArea, unionRect, ZERO_RECT, type Rect, type Vec2 } from "./draw"
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
} from "../../../src/platform/web"
import { Compositor } from "./compositor"
import { dispatchDoubleClickEvent, dispatchKeyEvent, dispatchPointerCancelEvent, dispatchPointerEvent, dispatchWheelEvent } from "./ui.dispatch"
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
  private debugPaintFlash = false
  private debugFlashEntries: Array<{ rect: Rect; startMs: number; hue: number }> = []
  private debugFlashHue = 0
  private readonly FLASH_DURATION_MS = 600
  private readonly onTopLevelPointerDown?: (top: UIElement, target: UIElement) => void
  private readonly onNativePointerDown?: (event: PointerEvent) => void
  private readonly onNativePointerUp?: (event: PointerEvent) => void
  private readonly onNativeWheel?: (event: WheelEvent) => void
  private readonly removeResizeListener: () => void
  private readonly removeLostPointerCaptureListener: () => void
  private readonly removeBrowserInteractionCancelListener: () => void
  private cursor: CursorKind = "default"
  private readonly doubleClickWindowMs = 320
  private readonly doubleClickDistSq = 36
  private readonly clickUpEvents = createEventStream<{
    target: UIElement
    pointerId: number
    x: number
    y: number
    button: number
    buttons: number
    altKey: boolean
    ctrlKey: boolean
    shiftKey: boolean
    metaKey: boolean
    timeStamp: number
  }>()
  private doubleClickSub: { unsubscribe(): void } | null = null

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

  constructor(
    canvas: HTMLCanvasElement,
    root: UIElement,
    opts: {
      onTopLevelPointerDown?: (top: UIElement, target: UIElement) => void
      onNativePointerDown?: (event: PointerEvent) => void
      onNativePointerUp?: (event: PointerEvent) => void
      onNativeWheel?: (event: WheelEvent) => void
    } = {},
  ) {
    this.canvas = canvas
    const ctx = canvas.getContext("2d", { alpha: false, desynchronized: true })
    if (!ctx) throw new Error("2D context not available")
    this.ctx = ctx
    this.root = root
    this.onTopLevelPointerDown = opts.onTopLevelPointerDown
    this.onNativePointerDown = opts.onNativePointerDown
    this.onNativePointerUp = opts.onNativePointerUp
    this.onNativeWheel = opts.onNativeWheel

    this.startDoubleClickClassifier()
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
    this.doubleClickSub?.unsubscribe()
    this.doubleClickSub = null
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

  /**
   * Toggle paint-flash debug mode. When enabled, every repainted region is highlighted
   * with a coloured semi-transparent overlay that fades out over ~600 ms. Consecutive
   * dirty rects get different hues so simultaneous repaints are easy to distinguish.
   */
  setDebugPaintFlash(on: boolean) {
    if (this.debugPaintFlash === on) return
    const stale = on ? [] : this.debugFlashEntries.slice()
    this.debugPaintFlash = on
    if (!on) this.debugFlashEntries = []
    if (!on) {
      for (const f of stale) this.invalidateRect(f.rect, { pad: 1 })
    }
  }

  isDebugPaintFlashEnabled() {
    return this.debugPaintFlash
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
    const now = performance.now()

    // Age-out expired flash entries before deciding whether there is work to do.
    if (this.debugPaintFlash) {
      this.debugFlashEntries = this.debugFlashEntries.filter((f) => now - f.startMs < this.FLASH_DURATION_MS)
    }

    const hasDirty = this.dirtyFull || this.dirty.length > 0
    const hasFlashes = this.debugPaintFlash && this.debugFlashEntries.length > 0
    if (!hasDirty && !hasFlashes) return

    const ctx = this.ctx
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    const frameId = (this.frameId += 1)
    this.compositor.beginFrame(ctx, frameId)

    const full = { x: 0, y: 0, w: this.cssW, h: this.cssH }
    const dirtyRects = this.dirtyFull ? [full] : this.dirty.slice()
    this.dirty = []
    this.dirtyFull = false

    // Flash rects from previous frames must also be content-repainted each fade frame
    // so that the prior frame's baked-in overlay is erased before we draw the new one.
    const paintRects = hasFlashes ? [...dirtyRects, ...this.debugFlashEntries.map((f) => f.rect)] : dirtyRects

    for (const r of paintRects) {
      ctx.save()
      ctx.beginPath()
      ctx.rect(r.x, r.y, r.w, r.h)
      ctx.clip()
      ctx.fillStyle = neutral[925]
      ctx.fillRect(r.x, r.y, r.w, r.h)
      this.root.draw(ctx, { clip: r, compositor: this.compositor, frameId, dpr: this.dpr, invalidateRect: (rect, opts) => this.invalidateRect(rect, opts) })
      const overlay = this.debugOverlay
      if (overlay && intersects(overlay, r)) {
        ctx.save()
        ctx.globalAlpha = 1
        ctx.fillStyle = alpha(theme.colors.accent, 0.12)
        ctx.strokeStyle = alpha(theme.colors.accent, 0.6)
        ctx.lineWidth = 1
        ctx.fillRect(overlay.x, overlay.y, overlay.w, overlay.h)
        ctx.strokeRect(overlay.x + 0.5, overlay.y + 0.5, Math.max(0, overlay.w - 1), Math.max(0, overlay.h - 1))
        ctx.restore()
      }
      ctx.restore()
    }

    if (this.debugPaintFlash) {
      ctx.save()

      // 1. Draw fading overlays for flash entries that are carrying over from previous frames.
      for (const f of this.debugFlashEntries) {
        const t = 1 - (now - f.startMs) / this.FLASH_DURATION_MS
        if (t <= 0) continue
        ctx.globalAlpha = t * 0.3
        ctx.fillStyle = `hsl(${f.hue},100%,55%)`
        ctx.fillRect(f.rect.x, f.rect.y, f.rect.w, f.rect.h)
        ctx.globalAlpha = Math.min(1, t * 1.5) * 0.7
        ctx.strokeStyle = `hsl(${f.hue},100%,55%)`
        ctx.lineWidth = 1
        ctx.strokeRect(f.rect.x + 0.5, f.rect.y + 0.5, Math.max(0, f.rect.w - 1), Math.max(0, f.rect.h - 1))
      }

      // 2. Record and immediately draw fresh (full-opacity) overlays for newly dirty rects.
      for (const r of dirtyRects) {
        this.debugFlashHue = (this.debugFlashHue + 60) % 360
        const hue = this.debugFlashHue
        this.debugFlashEntries.push({ rect: r, startMs: now, hue })
        ctx.globalAlpha = 0.3
        ctx.fillStyle = `hsl(${hue},100%,55%)`
        ctx.fillRect(r.x, r.y, r.w, r.h)
        ctx.globalAlpha = 0.7
        ctx.strokeStyle = `hsl(${hue},100%,55%)`
        ctx.lineWidth = 1
        ctx.strokeRect(r.x + 0.5, r.y + 0.5, Math.max(0, r.w - 1), Math.max(0, r.h - 1))
      }

      ctx.restore()

      // Keep the fade animation going as long as any flash entry is alive.
      if (this.debugFlashEntries.length > 0) this.scheduleRender()
    }
  }

  private releasePointerCapture() {
    if (this.activePointerId === null) return
    releaseElementPointerCapture(this.canvas, this.activePointerId)
    this.activePointerId = null
  }

  private startDoubleClickClassifier() {
    this.doubleClickSub?.unsubscribe()
    this.doubleClickSub = classifySpatialClicks({
      clicks: this.clickUpEvents.stream,
      windowMs: this.doubleClickWindowMs,
      distanceSq: this.doubleClickDistSq,
      canPair: (first, second) => {
        if (first.target !== second.target) return false
        if (first.button !== 0 || second.button !== 0) return false
        if (first.pointerId !== second.pointerId) return false
        return true
      },
    }).subscribe((event) => {
      if (event.kind !== "double") return
      const second = event.second
      const pointerEvent = new PointerUIEvent({
        pointerId: second.pointerId,
        x: second.x,
        y: second.y,
        button: second.button,
        buttons: second.buttons,
        altKey: second.altKey,
        ctrlKey: second.ctrlKey,
        shiftKey: second.shiftKey,
        metaKey: second.metaKey,
        timeStamp: second.timeStamp,
      })
      dispatchDoubleClickEvent(second.target, pointerEvent)
    })
  }

  private resetDoubleClickClassifier() {
    this.startDoubleClickClassifier()
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
      timeStamp: e.timeStamp,
    })
  }

  private cancelPointerSession(reason: InteractionCancelReason, nativeEvent?: PointerEvent | null) {
    this.resetDoubleClickClassifier()
    const target = this.capture
    const oldHover = this.hover
    const topBefore = target ? this.topLevelTargetOf(target) : oldHover ? this.topLevelTargetOf(oldHover) : null
    const before = topBefore?.bounds() ?? null

    if (this.hover) {
      this.hover.emit("pointerleave")
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
    this.onNativePointerDown?.(e)
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
      timeStamp: e.timeStamp,
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
      this.hover?.emit("pointerleave")
      over?.emit("pointerenter")
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
      timeStamp: e.timeStamp,
    })
    let topBefore: UIElement | null = target
    if (topBefore) topBefore = this.topLevelTargetOf(topBefore)
    const before = topBefore ? topBefore.bounds() : null
    const dispatch = dispatchPointerEvent(target, ev, "move")
    let topAfter: UIElement | null = target
    if (topAfter) topAfter = this.topLevelTargetOf(topAfter)
    const after = topAfter ? topAfter.bounds() : before
    const shouldInvalidate = this.capture !== null || dispatch.handled || !before || !after || !this.rectEquals(before, after)
    if (!shouldInvalidate) return
    if (before && after) this.invalidateRect(unionRect(before, after), { pad: 24 })
    else if (after) this.invalidateRect(after, { pad: 24 })
  }

  private onPointerUp = (e: PointerEvent) => {
    this.onNativePointerUp?.(e)
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
    if (e.button === 0 && pointInRect(p, target.bounds())) {
      this.clickUpEvents.emit({
        target,
        pointerId: e.pointerId,
        x: p.x,
        y: p.y,
        button: e.button,
        buttons: e.buttons,
        altKey: e.altKey,
        ctrlKey: e.ctrlKey,
        shiftKey: e.shiftKey,
        metaKey: e.metaKey,
        timeStamp: e.timeStamp,
      })
    }
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
    previous?.emit("blur")
    target?.emit("focus")
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

  private rectEquals(a: Rect, b: Rect) {
    return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h
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
    this.onNativeWheel?.(e)
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
      timeStamp: e.timeStamp,
    })
    dispatchWheelEvent(target, ev)
    if (!ev.didHandle) return
    e.preventDefault()
    let top: UIElement | null = target
    while (top && top.parent && top.parent !== this.root) top = top.parent
    if (top) this.invalidateRect(top.bounds(), { pad: 24 })
  }
}
