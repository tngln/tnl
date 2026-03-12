import { theme } from "../../config/theme"
import type { Shape } from "../../core/draw"
import type { InteractionCancelReason } from "../../core/event_stream"
import { clampRect, inflateRect, intersects, mergeRectInto, normalizeRect, rectArea, unionRect, clamp } from "../../core/rect"
import type { Vec2, Rect } from "../../core/rect"
import { addBrowserInteractionCancelListener, addLostPointerCaptureListener, addWindowResizeListener, getClampedDevicePixelRatio, releaseElementPointerCapture, resetElementCursor, scheduleAnimationFrame, setElementCursor, setElementPointerCapture, type CursorKind } from "../../platform/web"
import { Compositor } from "./compositor"

export type { Vec2, Rect }
export type { CursorKind }
export type RRect = { x: number; y: number; w: number; h: number; r: number }
export type Circle = { x: number; y: number; r: number }

export function pointInRect(p: Vec2, r: Rect) {
  return p.x >= r.x && p.y >= r.y && p.x <= r.x + r.w && p.y <= r.y + r.h
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

export type KeyLike = {
  code: string
  key: string
  repeat: boolean
  altKey: boolean
  ctrlKey: boolean
  shiftKey: boolean
  metaKey: boolean
}

export type KeyDispatchResult = {
  consumed: boolean
  preventDefault: boolean
}

export type PointerDispatchResult = {
  target: UIEventTargetNode | null
  captureTarget: UIEventTargetNode | null
  focusTarget: UIEventTargetNode | null
  handled: boolean
  propagationStopped: boolean
}

export type UIEventPhase = "target" | "bubble"

export interface UIEventTargetNode {
  eventParentTarget(): UIEventTargetNode | null
  canFocus?(): boolean
  onFocus?(): void
  onBlur?(): void
  onPointerDown?(e: PointerUIEvent): void
  onPointerMove?(e: PointerUIEvent): void
  onPointerUp?(e: PointerUIEvent): void
  onPointerCancel?(e: PointerUIEvent | null, reason: InteractionCancelReason): void
  onWheel?(e: WheelUIEvent): void
  onKeyDown?(e: KeyUIEvent): void
  onKeyUp?(e: KeyUIEvent): void
}

class UIEventBase {
  target: UIEventTargetNode | null = null
  currentTarget: UIEventTargetNode | null = null
  phase: UIEventPhase = "target"
  protected stopped = false

  stopPropagation() {
    this.stopped = true
  }

  get propagationStopped() {
    return this.stopped
  }

  withDispatch(target: UIEventTargetNode, currentTarget: UIEventTargetNode, phase: UIEventPhase) {
    this.target = target
    this.currentTarget = currentTarget
    this.phase = phase
  }
}

export class PointerUIEvent extends UIEventBase {
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
  private handled = false
  private requestedFocusTarget: UIEventTargetNode | null = null

  constructor(e: PointerLike) {
    super()
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

  capturePointer() {
    this.capture()
  }

  handle() {
    this.handled = true
  }

  preventDefault() {
    this.handle()
  }

  requestFocus(target?: UIEventTargetNode | null) {
    this.requestedFocusTarget = target ?? this.target
  }

  get didCapture() {
    return this.captured
  }

  get didHandle() {
    return this.handled
  }

  get focusTarget() {
    return this.requestedFocusTarget
  }

  withDispatch(target: UIEventTargetNode, currentTarget: UIEventTargetNode, phase: UIEventPhase, point?: Vec2) {
    super.withDispatch(target, currentTarget, phase)
    if (point) {
      ;(this as { x: number; y: number }).x = point.x
      ;(this as { y: number }).y = point.y
    }
  }

  adoptOutcome(other: PointerUIEvent) {
    if (other.target) this.target = other.target
    if (other.focusTarget) this.requestedFocusTarget = other.focusTarget
    if (other.didCapture) this.capturePointer()
    if (other.didHandle) this.handle()
    if (other.propagationStopped) this.stopPropagation()
  }
}

export class WheelUIEvent extends UIEventBase {
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
    super()
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

  preventDefault() {
    this.handle()
  }

  get didHandle() {
    return this.handled
  }

  withDispatch(target: UIEventTargetNode, currentTarget: UIEventTargetNode, phase: UIEventPhase, point?: Vec2) {
    super.withDispatch(target, currentTarget, phase)
    if (point) {
      ;(this as { x: number; y: number }).x = point.x
      ;(this as { y: number }).y = point.y
    }
  }

  adoptOutcome(other: WheelUIEvent) {
    if (other.target) this.target = other.target
    if (other.didHandle) this.handle()
    if (other.propagationStopped) this.stopPropagation()
  }
}

export class KeyUIEvent extends UIEventBase {
  readonly code: string
  readonly key: string
  readonly repeat: boolean
  readonly altKey: boolean
  readonly ctrlKey: boolean
  readonly shiftKey: boolean
  readonly metaKey: boolean
  private consumed = false
  private prevented = false

  constructor(e: KeyLike) {
    super()
    this.code = e.code
    this.key = e.key
    this.repeat = e.repeat
    this.altKey = e.altKey
    this.ctrlKey = e.ctrlKey
    this.shiftKey = e.shiftKey
    this.metaKey = e.metaKey
  }

  handle() {
    this.consume()
  }

  consume() {
    this.consumed = true
  }

  preventDefault() {
    this.consume()
    this.prevented = true
  }

  get didHandle() {
    return this.consumed
  }

  get didConsume() {
    return this.consumed
  }

  get didPreventDefault() {
    return this.prevented
  }

  adoptOutcome(other: KeyUIEvent) {
    if (other.target) this.target = other.target
    if (other.didConsume) this.consume()
    if (other.didPreventDefault) this.preventDefault()
    if (other.propagationStopped) this.stopPropagation()
  }
}

function buildEventPath(target: UIEventTargetNode | null) {
  const path: UIEventTargetNode[] = []
  let current = target
  while (current) {
    path.push(current)
    current = current.eventParentTarget()
  }
  return path
}

export function dispatchPointerEvent(
  target: UIEventTargetNode | null,
  event: PointerUIEvent,
  kind: "down" | "move" | "up",
  pointForTarget?: (node: UIEventTargetNode) => Vec2 | undefined,
) {
  if (!target) {
    return {
      target: null,
      captureTarget: null,
      focusTarget: null,
      handled: false,
      propagationStopped: false,
    } satisfies PointerDispatchResult
  }
  const path = buildEventPath(target)
  const originalTarget = path[0]
  for (let i = 0; i < path.length; i++) {
    const current = path[i]
    event.withDispatch(originalTarget, current, i === 0 ? "target" : "bubble", pointForTarget?.(current))
    if (kind === "down") current.onPointerDown?.(event)
    else if (kind === "move") current.onPointerMove?.(event)
    else current.onPointerUp?.(event)
    if (event.propagationStopped) break
  }
  return {
    target: originalTarget,
    captureTarget: event.didCapture ? originalTarget : null,
    focusTarget: event.focusTarget ?? null,
    handled: event.didHandle,
    propagationStopped: event.propagationStopped,
  } satisfies PointerDispatchResult
}

export function dispatchWheelEvent(target: UIEventTargetNode | null, event: WheelUIEvent, pointForTarget?: (node: UIEventTargetNode) => Vec2 | undefined) {
  if (!target) return
  const path = buildEventPath(target)
  const originalTarget = path[0]
  for (let i = 0; i < path.length; i++) {
    const current = path[i]
    event.withDispatch(originalTarget, current, i === 0 ? "target" : "bubble", pointForTarget?.(current))
    current.onWheel?.(event)
    if (event.propagationStopped) break
  }
}

export function dispatchKeyEvent(target: UIEventTargetNode | null, event: KeyUIEvent, kind: "down" | "up") {
  if (!target) return
  const path = buildEventPath(target)
  const originalTarget = path[0]
  for (let i = 0; i < path.length; i++) {
    const current = path[i]
    event.withDispatch(originalTarget, current, i === 0 ? "target" : "bubble")
    if (kind === "down") current.onKeyDown?.(event)
    else current.onKeyUp?.(event)
    if (event.propagationStopped) break
  }
}

export function dispatchPointerCancelEvent(
  target: UIEventTargetNode | null,
  event: PointerUIEvent | null,
  reason: InteractionCancelReason,
  pointForTarget?: (node: UIEventTargetNode) => Vec2 | undefined,
) {
  if (!target) return
  const path = buildEventPath(target)
  const originalTarget = path[0]
  for (let i = 0; i < path.length; i++) {
    const current = path[i]
    if (event) event.withDispatch(originalTarget, current, i === 0 ? "target" : "bubble", pointForTarget?.(current))
    current.onPointerCancel?.(event, reason)
    if (event?.propagationStopped) break
  }
}

export type DebugTreeNodeSnapshot = {
  kind: "element" | "surface"
  type: string
  label: string
  id?: string
  bounds?: Rect
  z?: number
  visible?: boolean
  meta?: string
  listeners?: DebugEventListenerSnapshot[]
  children: DebugTreeNodeSnapshot[]
}

export type DebugEventListenerSnapshot = {
  id: string
  label: string
  detail?: string
}

export abstract class UIElement {
  parent: UIElement | null = null
  children: UIElement[] = []
  visible = true
  z = 0
  private rt: { clip?: Rect; compositor?: Compositor; frameId: number; dpr: number; invalidateRect?: (rect: Rect, opts?: { pad?: number; force?: boolean }) => void } | null = null

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

  eventParentTarget(): UIEventTargetNode | null {
    return this.parent
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

  cursorAt(p: Vec2, ctx?: CanvasRenderingContext2D): CursorKind | null {
    if (!this.visible) return null
    if (!this.containsPoint(p, ctx)) return null
    for (let i = this.children.length - 1; i >= 0; i--) {
      const cursor = this.children[i].cursorAt(p, ctx)
      if (cursor) return cursor
    }
    return null
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

  protected debugDescribe(): Omit<DebugTreeNodeSnapshot, "children"> | null {
    return {
      kind: "element",
      type: this.constructor.name || "UIElement",
      label: this.constructor.name || "UIElement",
      bounds: this.bounds(),
      z: this.z,
      visible: this.visible,
    }
  }

  protected debugChildren(): DebugTreeNodeSnapshot[] {
    return this.children.map((child) => child.debugSnapshot())
  }

  protected debugListeners(): DebugEventListenerSnapshot[] | null {
    return null
  }

  private inferDebugListeners(): DebugEventListenerSnapshot[] | null {
    const out: DebugEventListenerSnapshot[] = []
    const add = (id: string, label: string) => out.push({ id, label })
    const overridden = (fn: keyof UIElement) => (this as any)[fn] !== (UIElement.prototype as any)[fn]
    if (overridden("onPointerDown")) add("pointer.down", "Pointer Down")
    if (overridden("onPointerMove")) add("pointer.move", "Pointer Move")
    if (overridden("onPointerUp")) add("pointer.up", "Pointer Up")
    if (overridden("onPointerCancel")) add("pointer.cancel", "Pointer Cancel")
    if (overridden("onPointerEnter")) add("pointer.enter", "Pointer Enter")
    if (overridden("onPointerLeave")) add("pointer.leave", "Pointer Leave")
    if (overridden("onWheel")) add("wheel", "Wheel")
    if (overridden("onKeyDown")) add("key.down", "Key Down")
    if (overridden("onKeyUp")) add("key.up", "Key Up")
    if (overridden("canFocus") || this.canFocus()) add("focus", "Focus")
    return out.length ? out : null
  }

  debugSnapshot(): DebugTreeNodeSnapshot {
    const described = this.debugDescribe()
    const listeners = this.debugListeners() ?? this.inferDebugListeners()
    if (!described) {
      return {
        kind: "element",
        type: this.constructor.name || "UIElement",
        label: this.constructor.name || "UIElement",
        listeners: listeners ?? undefined,
        children: this.debugChildren(),
      }
    }
    return {
      ...described,
      listeners: listeners ?? undefined,
      children: this.debugChildren(),
    }
  }

  draw(ctx: CanvasRenderingContext2D, rt?: { clip?: Rect; compositor?: Compositor; frameId: number; dpr: number; invalidateRect?: (rect: Rect, opts?: { pad?: number; force?: boolean }) => void }) {
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
  captureCursor(): CursorKind | null {
    for (let i = this.children.length - 1; i >= 0; i--) {
      const child = this.children[i]
      if (!(child instanceof CursorRegion)) continue
      const bounds = child.bounds()
      const cursor = child.cursorAt({ x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h / 2 })
      if (cursor) return cursor
    }
    return null
  }

  onPointerDown(_e: PointerUIEvent) {}
  onPointerMove(_e: PointerUIEvent) {}
  onPointerUp(_e: PointerUIEvent) {}
  onPointerCancel(_e: PointerUIEvent | null, _reason: InteractionCancelReason) {}
  onWheel(_e: WheelUIEvent) {}
  canFocus() {
    return false
  }
  onFocus() {}
  onBlur() {}
  onRuntimeActivate() {}
  onRuntimeDeactivate() {}
  onKeyDown(_e: KeyUIEvent) {}
  onKeyUp(_e: KeyUIEvent) {}
  onPointerEnter() {}
  onPointerLeave() {}

  protected invalidateSelf(opts?: { pad?: number; force?: boolean }) {
    this.rt?.invalidateRect?.(this.bounds(), opts)
  }
}

export class CursorRegion extends UIElement {
  private readonly rect: () => Rect
  private readonly cursor: () => CursorKind
  private readonly active: () => boolean

  constructor(opts: { rect: () => Rect; cursor: CursorKind | (() => CursorKind); active?: () => boolean }) {
    super()
    this.rect = opts.rect
    const cursor = opts.cursor
    this.cursor = typeof cursor === "function" ? () => cursor() : () => cursor
    this.active = opts.active ?? (() => true)
  }

  bounds(): Rect {
    if (!this.active()) return { x: 0, y: 0, w: 0, h: 0 }
    return this.rect()
  }

  protected containsPoint(p: Vec2) {
    return this.active() && pointInRect(p, this.rect())
  }

  hitTest(_p: Vec2, _ctx?: CanvasRenderingContext2D): UIElement | null {
    return null
  }

  cursorAt(p: Vec2, _ctx?: CanvasRenderingContext2D): CursorKind | null {
    if (!this.active() || !pointInRect(p, this.rect())) return null
    return this.cursor()
  }
}

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
        ctx.fillStyle = "rgba(100,160,255,0.12)"
        ctx.strokeStyle = "rgba(120,180,255,0.90)"
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
      const oldTop = this.hover ? (() => {
        return this.topLevelTargetOf(this.hover as UIElement)
      })() : null
      const newTop = over ? (() => {
        return this.topLevelTargetOf(over as UIElement)
      })() : null
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
    const before = top ? top.bounds() : { x: 0, y: 0, w: 0, h: 0 }
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
