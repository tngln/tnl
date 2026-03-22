import { theme, alpha, neutral } from "../theme"
import type { InteractionCancelReason } from "../event_stream"
import { clampRect, inflateRect, intersects, mergeRectInto, normalizeRect, rectArea, unionRect, ZERO_RECT, type Rect, type Vec2 } from "../draw"
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
} from "../platform/web"
import { Compositor } from "./compositor"
import { dispatchDoubleClickEvent, dispatchKeyEvent, dispatchPointerCancelEvent, dispatchPointerEvent, dispatchWheelEvent } from "./ui.dispatch"
import { KeyUIEvent, type KeyLike, PointerUIEvent, WheelUIEvent } from "./ui.events"
import { UIElement, type DebugTreeNodeSnapshot, type InvalidateRectOpts } from "./ui.element"
import { pointInRect } from "./ui.hit_test"
import { CanvasRuntimeDebugState, FocusSession, PointerSession, type DebugCanvasRuntimeSnapshot } from "./ui.session"

export type DebugInspectorPickHit = {
  path: string
  label: string
  type: string
  id?: string
  meta?: string
  bounds?: Rect
}

type DebugInspectorPickSession = {
  onHover?: (hit: DebugInspectorPickHit | null) => void
  onPick?: (hit: DebugInspectorPickHit | null) => void
  onCancel?: () => void
  hovered: DebugInspectorPickHit | null
  pointer: Vec2 | null
}

type DebugInspectorPickCandidate = DebugInspectorPickHit & {
  priority: number
  area: number
  depth: number
}

export class CanvasUI {
  readonly canvas: HTMLCanvasElement
  readonly ctx: CanvasRenderingContext2D
  readonly root: UIElement
  private rafPending = false
  private dpr = 1
  private cssW = 1
  private cssH = 1
  private dirty: Rect[] = []
  private dirtyFull = true
  private frameId = 0
  private compositor = new Compositor()
  private readonly pointerSession: PointerSession
  private readonly focusSession = new FocusSession()
  private readonly debugState = new CanvasRuntimeDebugState()
  private debugOverlay: Rect | null = null
  private debugInspectorPick: DebugInspectorPickSession | null = null
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

  get sizeCss(): Vec2 {
    return { x: this.cssW, y: this.cssH }
  }

  get devicePixelRatio(): number {
    return this.dpr
  }

  get hoverTarget() {
    return this.pointerSession.hoverTarget
  }

  get captureTarget() {
    return this.pointerSession.captureTarget
  }

  get focusTarget() {
    return this.focusSession.focusedTarget
  }

  get hoverTopLevelTarget() {
    return this.pointerSession.hoverTarget ? this.topLevelTargetOf(this.pointerSession.hoverTarget) : null
  }

  get captureTopLevelTarget() {
    return this.pointerSession.captureTarget ? this.topLevelTargetOf(this.pointerSession.captureTarget) : null
  }

  get focusTopLevelTarget() {
    return this.focusSession.focusedTarget ? this.topLevelTargetOf(this.focusSession.focusedTarget) : null
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
    this.pointerSession = new PointerSession({
      doubleClickWindowMs: this.doubleClickWindowMs,
      doubleClickDistanceSq: this.doubleClickDistSq,
      onDoubleClick: (second) => {
        this.debugState.recordEvent({
          kind: "doubleclick",
          at: second.timeStamp,
          pointerId: second.pointerId,
          hitTarget: second.target,
          dispatchTarget: second.target,
        })
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
      },
    })
    this.onTopLevelPointerDown = opts.onTopLevelPointerDown
    this.onNativePointerDown = opts.onNativePointerDown
    this.onNativePointerUp = opts.onNativePointerUp
    this.onNativeWheel = opts.onNativeWheel

    this.resize()
    this.removeResizeListener = addWindowResizeListener(this.resize)
    this.removeLostPointerCaptureListener = addLostPointerCaptureListener(canvas, (pointerId) => {
      if (this.pointerSession.pointerId !== pointerId) return
      this.cancelPointerSession("lost-capture")
    })
    this.removeBrowserInteractionCancelListener = addBrowserInteractionCancelListener((reason) => {
      this.cancelDebugInspectorPick(true)
      this.cancelPointerSession(reason)
      this.clearFocus(reason)
    })

    canvas.addEventListener("pointerdown", this.onPointerDown)
    canvas.addEventListener("pointermove", this.onPointerMove)
    canvas.addEventListener("pointerup", this.onPointerUp)
    canvas.addEventListener("pointercancel", this.onPointerCancel)
    canvas.addEventListener("wheel", this.onWheel, { passive: false })
    canvas.addEventListener("contextmenu", (e) => e.preventDefault())
  }

  destroy() {
    this.cancelDebugInspectorPick(false)
    this.pointerSession.destroy()
    this.removeResizeListener()
    this.removeLostPointerCaptureListener()
    this.removeBrowserInteractionCancelListener()
    this.canvas.removeEventListener("pointerdown", this.onPointerDown)
    this.canvas.removeEventListener("pointermove", this.onPointerMove)
    this.canvas.removeEventListener("pointerup", this.onPointerUp)
    this.canvas.removeEventListener("pointercancel", this.onPointerCancel)
    this.canvas.removeEventListener("wheel", this.onWheel)
    this.releasePointerCapture()
    this.clearFocus("destroy")
    this.applyCursor("default")
  }

  invalidate(source = "canvas.full") {
    this.debugState.recordInvalidation({ x: 0, y: 0, w: this.cssW, h: this.cssH }, { force: true, source })
    this.dirtyFull = true
    this.dirty = []
    this.scheduleRender()
  }

  invalidateRect(r: Rect, opts: InvalidateRectOpts = {}) {
    if (opts.force) return this.invalidate(opts.source ?? "canvas.force")
    const pad = opts.pad ?? 2
    const b = { x: 0, y: 0, w: this.cssW, h: this.cssH }
    const n = normalizeRect(r)
    const inf = inflateRect(n, pad)
    const c = clampRect(inf, b)
    if (!c) return
    this.debugState.recordInvalidation(c, { ...opts, pad })
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
    if (prev && rect) this.invalidateRect(unionRect(prev, rect), { pad: 12, source: "canvas.debugOverlay" })
    else if (prev) this.invalidateRect(prev, { pad: 12, source: "canvas.debugOverlay" })
    else if (rect) this.invalidateRect(rect, { pad: 12, source: "canvas.debugOverlay" })
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
      for (const f of stale) this.invalidateRect(f.rect, { pad: 1, source: "canvas.paintFlash" })
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

  debugInteractionState(): DebugCanvasRuntimeSnapshot {
    return this.debugState.snapshot(this.pointerSession.snapshot(), this.focusSession.snapshot())
  }

  beginDebugInspectorPick(opts: {
    onHover?: (hit: DebugInspectorPickHit | null) => void
    onPick?: (hit: DebugInspectorPickHit | null) => void
    onCancel?: () => void
  }) {
    this.cancelDebugInspectorPick(false)
    const session: DebugInspectorPickSession = {
      ...opts,
      hovered: null,
      pointer: null,
    }
    this.debugInspectorPick = session
    this.invalidate("canvas.debugPick")
    this.applyCursor("crosshair")
    return () => {
      if (this.debugInspectorPick !== session) return
      this.cancelDebugInspectorPick(true)
    }
  }

  isDebugInspectorPickActive() {
    return this.debugInspectorPick !== null
  }

  private cancelDebugInspectorPick(notify: boolean) {
    const session = this.debugInspectorPick
    if (!session) return
    this.debugInspectorPick = null
    session.onHover?.(null)
    if (notify) session.onCancel?.()
    this.invalidate("canvas.debugPick")
    this.applyCursor("default")
  }

  private updateDebugInspectorHover(p: Vec2) {
    const session = this.debugInspectorPick
    if (!session) return null
    const next = this.resolveDebugInspectorPickAt(p)
    if (sameDebugInspectorPickHit(session.hovered, next) && vecEquals(session.pointer, p)) return next
    session.hovered = next
    session.pointer = { ...p }
    session.onHover?.(next)
    this.invalidate("canvas.debugPick")
    return next
  }

  private completeDebugInspectorPick(p: Vec2) {
    const session = this.debugInspectorPick
    if (!session) return
    const hit = this.resolveDebugInspectorPickAt(p)
    this.debugInspectorPick = null
    session.onHover?.(null)
    session.onPick?.(hit)
    this.invalidate("canvas.debugPick")
    this.applyCursor("default")
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
    this.invalidate("canvas.resize")
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
      const overlays = [
        this.debugOverlay
          ? { rect: this.debugOverlay, fill: alpha(theme.colors.accent, 0.12), stroke: alpha(theme.colors.accent, 0.6) }
          : null,
        this.debugInspectorPick?.hovered?.bounds
          ? { rect: this.debugInspectorPick.hovered.bounds, fill: alpha(theme.colors.accent, 0.18), stroke: alpha(theme.colors.accent, 0.92) }
          : null,
      ]
      for (const overlay of overlays) {
        if (!overlay || !intersects(overlay.rect, r)) continue
        ctx.save()
        ctx.globalAlpha = 1
        ctx.fillStyle = overlay.fill
        ctx.strokeStyle = overlay.stroke
        ctx.lineWidth = 1
        ctx.fillRect(overlay.rect.x, overlay.rect.y, overlay.rect.w, overlay.rect.h)
        ctx.strokeRect(overlay.rect.x + 0.5, overlay.rect.y + 0.5, Math.max(0, overlay.rect.w - 1), Math.max(0, overlay.rect.h - 1))
        ctx.restore()
      }
      const pick = this.debugInspectorPick
      if (pick?.hovered && pick.pointer) {
        const tooltip = debugInspectorTooltipRect(ctx, pick.pointer, pick.hovered, this.cssW, this.cssH)
        if (intersects(tooltip.rect, r)) {
          ctx.save()
          ctx.fillStyle = alpha(neutral[50], 0.96)
          ctx.strokeStyle = alpha(neutral[300], 0.8)
          ctx.lineWidth = 1
          ctx.fillRect(tooltip.rect.x, tooltip.rect.y, tooltip.rect.w, tooltip.rect.h)
          ctx.strokeRect(tooltip.rect.x + 0.5, tooltip.rect.y + 0.5, Math.max(0, tooltip.rect.w - 1), Math.max(0, tooltip.rect.h - 1))
          ctx.fillStyle = neutral[925]
          ctx.font = tooltip.font
          ctx.textAlign = "start"
          ctx.textBaseline = "top"
          ctx.fillText(tooltip.text, tooltip.rect.x + 8, tooltip.rect.y + 6)
          ctx.restore()
        }
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
    const pointerId = this.pointerSession.pointerId
    if (pointerId === null) return
    releaseElementPointerCapture(this.canvas, pointerId)
    this.pointerSession.clearPointer()
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
    this.pointerSession.resetDoubleClickClassifier()
    const target = this.pointerSession.captureTarget
    const oldHover = this.pointerSession.hoverTarget
    const topBefore = target ? this.topLevelTargetOf(target) : oldHover ? this.topLevelTargetOf(oldHover) : null
    const before = topBefore?.bounds() ?? null

    if (oldHover) {
      oldHover.emit("pointerleave")
      this.pointerSession.setHover(null)
    }

    if (target) {
      this.debugState.recordEvent({
        kind: "pointercancel",
        at: nativeEvent?.timeStamp,
        pointerId: nativeEvent?.pointerId,
        reason,
        hitTarget: oldHover ?? target,
        dispatchTarget: target,
      })
      dispatchPointerCancelEvent(target, nativeEvent ? this.pointerUiEventFromNative(nativeEvent) : null, reason)
      this.pointerSession.setCapture(null)
    }

    this.releasePointerCapture()
    this.applyResolvedCursor(nativeEvent ? this.toCanvasPoint(nativeEvent) : null)

    const after = topBefore?.bounds() ?? before
    if (before && after) this.invalidateRect(unionRect(before, after), { pad: 24, source: "canvas.pointerCancel" })
    else if (before) this.invalidateRect(before, { pad: 24, source: "canvas.pointerCancel" })
  }

  private onPointerDown = (e: PointerEvent) => {
    if (this.debugInspectorPick) {
      this.completeDebugInspectorPick(this.toCanvasPoint(e))
      return
    }
    this.onNativePointerDown?.(e)
    const p = this.toCanvasPoint(e)
    const target = this.root.hitTest(p, this.ctx)
    if (!target) return
    this.pointerSession.beginPointer(e.pointerId)
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
    this.debugState.recordEvent({
      kind: "pointerdown",
      at: e.timeStamp,
      pointerId: e.pointerId,
      hitTarget: target,
      dispatchTarget: target,
    })
    const before = top.bounds()
    const dispatch = dispatchPointerEvent(target, ev, "down")
    const focusTarget = dispatch.focusTarget instanceof UIElement ? dispatch.focusTarget : dispatch.target instanceof UIElement ? dispatch.target : target
    this.focusElement(this.resolveFocusableTarget(focusTarget), "pointerdown")
    if (dispatch.captureTarget === dispatch.target && target instanceof UIElement) this.pointerSession.setCapture(target)
    this.applyResolvedCursor(p, this.pointerSession.captureTarget ?? target)
    const after = top.bounds()
    this.invalidateRect(unionRect(before, after), { pad: 24, source: "canvas.pointerDown" })
  }

  private onPointerMove = (e: PointerEvent) => {
    if (this.debugInspectorPick) {
      this.updateDebugInspectorHover(this.toCanvasPoint(e))
      this.applyCursor("crosshair")
      return
    }
    if (this.pointerSession.captureTarget && this.pointerSession.pointerId === e.pointerId && (e.buttons & 1) === 0) {
      this.cancelPointerSession("buttons-released", e)
      return
    }
    const p = this.toCanvasPoint(e)
    const over = this.root.hitTest(p, this.ctx)
    const hover = this.pointerSession.hoverTarget
    if (over !== hover) {
      const oldTop = hover ? this.topLevelTargetOf(hover) : null
      const newTop = over ? this.topLevelTargetOf(over) : null
      hover?.emit("pointerleave")
      over?.emit("pointerenter")
      this.pointerSession.setHover(over)
      if (oldTop && newTop) this.invalidateRect(unionRect(oldTop.bounds(), newTop.bounds()), { pad: 8, source: "canvas.hover" })
      else if (oldTop) this.invalidateRect(oldTop.bounds(), { pad: 8, source: "canvas.hover" })
      else if (newTop) this.invalidateRect(newTop.bounds(), { pad: 8, source: "canvas.hover" })
    }
    this.applyResolvedCursor(p)
    const target = this.pointerSession.captureTarget ?? over
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
    this.debugState.recordEvent({
      kind: "pointermove",
      at: e.timeStamp,
      pointerId: e.pointerId,
      hitTarget: over,
      dispatchTarget: target,
    })
    let topBefore: UIElement | null = target
    if (topBefore) topBefore = this.topLevelTargetOf(topBefore)
    const before = topBefore ? topBefore.bounds() : null
    const dispatch = dispatchPointerEvent(target, ev, "move")
    let topAfter: UIElement | null = target
    if (topAfter) topAfter = this.topLevelTargetOf(topAfter)
    const after = topAfter ? topAfter.bounds() : before
    const shouldInvalidate = this.pointerSession.captureTarget !== null || dispatch.handled || !before || !after || !this.rectEquals(before, after)
    if (!shouldInvalidate) return
    if (before && after) this.invalidateRect(unionRect(before, after), { pad: 24, source: "canvas.pointerMove" })
    else if (after) this.invalidateRect(after, { pad: 24, source: "canvas.pointerMove" })
  }

  private onPointerUp = (e: PointerEvent) => {
    this.onNativePointerUp?.(e)
    const p = this.toCanvasPoint(e)
    const hit = this.root.hitTest(p, this.ctx)
    const target = this.pointerSession.captureTarget ?? hit
    if (!target) {
      this.pointerSession.setCapture(null)
      this.releasePointerCapture()
      return
    }
    const ev = this.pointerUiEventFromNative(e)
    this.debugState.recordEvent({
      kind: "pointerup",
      at: e.timeStamp,
      pointerId: e.pointerId,
      hitTarget: hit,
      dispatchTarget: target,
    })
    let top: UIElement | null = target
    if (top) top = this.topLevelTargetOf(top)
    const before = top ? top.bounds() : ZERO_RECT
    dispatchPointerEvent(target, ev, "up")
    if (e.button === 0 && pointInRect(p, target.bounds())) {
      this.pointerSession.emitClickUp({
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
    this.pointerSession.setCapture(null)
    this.releasePointerCapture()
    this.applyResolvedCursor(p)
    const after = top ? top.bounds() : before
    this.invalidateRect(unionRect(before, after), { pad: 24, source: "canvas.pointerUp" })
  }

  private onPointerCancel = (e: PointerEvent) => {
    if (this.debugInspectorPick) {
      this.cancelDebugInspectorPick(true)
      return
    }
    this.cancelPointerSession("pointercancel", e)
  }

  focusElement(target: UIElement | null, reason = "focus") {
    const result = this.focusSession.focus(target, reason)
    if (!result.changed) return
    if (result.previous) {
      this.debugState.recordEvent({
        kind: "blur",
        reason,
        dispatchTarget: result.previous,
        hitTarget: result.previous,
      })
    }
    if (result.current) {
      this.debugState.recordEvent({
        kind: "focus",
        reason,
        dispatchTarget: result.current,
        hitTarget: result.current,
      })
    }
  }

  clearFocus(reason = "clear") {
    this.focusElement(null, reason)
  }

  handleKeyDown(e: KeyLike) {
    const focus = this.focusSession.focusedTarget
    if (!focus) return { consumed: false, preventDefault: false }
    this.debugState.recordEvent({
      kind: "keydown",
      at: e.timeStamp,
      dispatchTarget: focus,
      hitTarget: focus,
    })
    const ev = new KeyUIEvent(e)
    dispatchKeyEvent(focus, ev, "down")
    return { consumed: ev.didConsume, preventDefault: ev.didPreventDefault }
  }

  handleKeyUp(e: KeyLike) {
    const focus = this.focusSession.focusedTarget
    if (!focus) return { consumed: false, preventDefault: false }
    this.debugState.recordEvent({
      kind: "keyup",
      at: e.timeStamp,
      dispatchTarget: focus,
      hitTarget: focus,
    })
    const ev = new KeyUIEvent(e)
    dispatchKeyEvent(focus, ev, "up")
    return { consumed: ev.didConsume, preventDefault: ev.didPreventDefault }
  }

  private applyCursor(next: CursorKind) {
    if (this.cursor === next) return
    this.cursor = next
    if (next === "default") resetElementCursor(this.canvas)
    else setElementCursor(this.canvas, next)
  }

  private resolveCursor(p: Vec2 | null, targetOverride?: UIElement | null): CursorKind {
    if (this.debugInspectorPick) return "crosshair"
    const target = targetOverride ?? this.pointerSession.captureTarget ?? this.pointerSession.hoverTarget
    if (target) {
      let top: UIElement = target
      top = this.topLevelTargetOf(top)
      const cursor = p ? top.cursorAt(p, this.ctx) : null
      if (cursor) return cursor
      if (p && pointInRect(p, top.bounds())) return "default"
      if (this.pointerSession.captureTarget && targetOverride === undefined) return this.pointerSession.captureTarget.captureCursor() ?? "default"
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

  private resolveDebugInspectorPickAt(p: Vec2): DebugInspectorPickHit | null {
    const snapshot = this.root.debugSnapshot()
    return findBestDebugSnapshotAtPoint(snapshot, p)
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
    this.debugState.recordEvent({
      kind: "wheel",
      at: e.timeStamp,
      hitTarget: target,
      dispatchTarget: target,
    })
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
    if (top) this.invalidateRect(top.bounds(), { pad: 24, source: "canvas.wheel" })
  }
}

function sameDebugInspectorPickHit(a: DebugInspectorPickHit | null, b: DebugInspectorPickHit | null) {
  if (!a && !b) return true
  if (!a || !b) return false
  return a.path === b.path
    && a.label === b.label
    && a.type === b.type
    && a.id === b.id
    && rectEquals(a.bounds, b.bounds)
}

function vecEquals(a: Vec2 | null, b: Vec2 | null) {
  if (!a && !b) return true
  if (!a || !b) return false
  return a.x === b.x && a.y === b.y
}

function rectEquals(a: Rect | undefined, b: Rect | undefined) {
  if (!a && !b) return true
  if (!a || !b) return false
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h
}

function findBestDebugSnapshotAtPoint(node: DebugTreeNodeSnapshot, point: Vec2): DebugInspectorPickHit | null {
  let best: DebugInspectorPickCandidate | null = null
  const visit = (current: DebugTreeNodeSnapshot, path: string, depth: number) => {
    if (current.bounds && !pointInRect(point, current.bounds)) return
    const candidate: DebugInspectorPickCandidate | null = current.bounds
      ? {
          path,
          label: current.label,
          type: current.type,
          id: current.id,
          meta: current.meta,
          bounds: current.bounds,
          priority: debugInspectorPickPriority(current),
          area: Math.max(0, current.bounds.w) * Math.max(0, current.bounds.h),
          depth,
        }
      : null
    if (candidate && isBetterDebugInspectorCandidate(candidate, best)) best = candidate
    for (let i = 0; i < current.children.length; i++) visit(current.children[i]!, `${path}.${i}`, depth + 1)
  }
  visit(node, "0", 0)
  const resolved = best as DebugInspectorPickCandidate | null
  if (!resolved) return null
  if (isDebugInspectorRootLike(resolved.type)) return null
  return {
    path: resolved.path,
    label: resolved.label,
    type: resolved.type,
    id: resolved.id,
    meta: resolved.meta,
    bounds: resolved.bounds,
  }
}

function isBetterDebugInspectorCandidate(
  next: DebugInspectorPickCandidate,
  current: DebugInspectorPickCandidate | null,
) {
  if (!current) return true
  if (next.priority !== current.priority) return next.priority < current.priority
  if (next.area !== current.area) return next.area < current.area
  return next.depth > current.depth
}

function debugInspectorPickPriority(node: DebugTreeNodeSnapshot) {
  if (node.type === "RenderElement") return 0
  if (node.kind === "element" && !isDebugInspectorWrapper(node.type)) return 1
  if (node.kind === "surface") return 2
  if (node.type === "RenderTree") return 3
  if (node.type === "RetainedTree") return 4
  if (node.type === "ViewportElement") return 5
  if (isDebugInspectorRootLike(node.type)) return 9
  return 6
}

function isDebugInspectorWrapper(type: string) {
  return type === "RenderTree"
    || type === "RetainedTree"
    || type === "ViewportElement"
    || isDebugInspectorRootLike(type)
}

function isDebugInspectorRootLike(type: string) {
  return type === "Root" || type === "SurfaceRoot"
}

function debugInspectorTooltipText(hit: DebugInspectorPickHit) {
  return hit.id ? `${hit.label} · ${hit.id}` : hit.label
}

function debugInspectorTooltipRect(
  ctx: CanvasRenderingContext2D,
  point: Vec2,
  hit: DebugInspectorPickHit,
  maxW: number,
  maxH: number,
) {
  const font = `${500} ${Math.max(10, theme.typography.body.size - 1)}px ${theme.typography.family}`
  ctx.save()
  ctx.font = font
  const text = debugInspectorTooltipText(hit)
  const textW = ctx.measureText(text).width
  ctx.restore()
  const w = Math.ceil(textW) + 16
  const h = 26
  const x = Math.min(Math.max(0, point.x + 12), Math.max(0, maxW - w))
  const y = Math.min(Math.max(0, point.y + 14), Math.max(0, maxH - h))
  return {
    text,
    font,
    rect: { x, y, w, h },
  }
}
