import { signal, type Signal } from "../../core/reactivity"
import { classifyClicks, createEventStream, dragSession, interactionCancelStream, type InteractionCancelReason } from "../../core/event_stream"
import { createMachine, type Machine } from "../../core/fsm"
import { draw, Line, Rect, Text } from "../../core/draw"
import { clamp } from "../../core/rect"
import { font, theme } from "../../config/theme"
import { isSurfaceMountSpec, mountSurface, type SurfaceMountSpec } from "../builder/surface_builder"
import { CursorRegion, pointInRect, type Rect as BoundsRect, type Vec2, PointerUIEvent, UIElement } from "../base/ui"
import { ViewportElement, type Surface } from "../base/viewport"

export type WindowSnapshot = {
  id: string
  title: string
  open: boolean
  minimized: boolean
  maximized: boolean
  screenUsage: "none" | "left-half" | "right-half"
  focused: boolean
  rect: BoundsRect
  chrome: "default" | "tool"
  resizable: boolean
  minimizable: boolean
  zOrder: number
}

type WindowHooks = {
  onStateChanged?: () => void
  onFocusRequested?: () => void
  onTitleDragStart?: (win: ModalWindow, pointer: Vec2) => void
  onTitleDragMove?: (win: ModalWindow, pointer: Vec2) => void
  onTitleDragEnd?: (win: ModalWindow, pointer: Vec2) => void
  onTitleDragCancel?: (win: ModalWindow, pointer: Vec2) => void
}

type WindowDragHooks = {
  onTitleDragStart?: (win: ModalWindow, pointer: Vec2) => void
  onTitleDragMove?: (win: ModalWindow, pointer: Vec2) => void
  onTitleDragEnd?: (win: ModalWindow, pointer: Vec2) => void
  onTitleDragCancel?: (win: ModalWindow, pointer: Vec2) => void
}

type TitleState = "idle" | "pressed" | "dragging"
type TitleContext = {
  originPointer: Vec2
  lastPointer: Vec2
  dragOffset: Vec2
  restoreFromAnchoredState: boolean
}
type TitleEvent =
  | { type: "PRESS"; pointer: Vec2 }
  | { type: "DRAG_START"; pointer: Vec2; dragOffset: Vec2; restoreFromAnchoredState: boolean }
  | { type: "DRAG_MOVE"; pointer: Vec2 }
  | { type: "RELEASE"; pointer: Vec2 }
  | { type: "CANCEL"; reason: string }
  | { type: "DOUBLE_CLICK" }
type TitleSnapshot = { state: TitleState; context: TitleContext }
type ResizeState = "idle" | "pressed" | "dragging"
type ResizeContext = { originPointer: Vec2; lastPointer: Vec2; startSize: Vec2 }
type ResizeEvent =
  | { type: "PRESS"; pointer: Vec2; startSize: Vec2 }
  | { type: "DRAG_START"; pointer: Vec2 }
  | { type: "DRAG_MOVE"; pointer: Vec2 }
  | { type: "RELEASE"; pointer: Vec2 }
  | { type: "CANCEL"; reason: string }

const TITLE_BUTTON_GAP = 2

function titleButtonRect(win: ModalWindow, slotFromRight: number): BoundsRect {
  const pad = win.chrome === "tool" ? 6 : theme.ui.closeButtonPad
  const size = win.titleBarHeight - pad * 2
  return {
    x: win.x.get() + win.w.get() - pad - size - slotFromRight * (size + TITLE_BUTTON_GAP),
    y: win.y.get() + pad,
    w: size,
    h: size,
  }
}

export class Root extends UIElement {
  bounds(): BoundsRect {
    return { x: -1e9, y: -1e9, w: 2e9, h: 2e9 }
  }

  protected debugDescribe() {
    return {
      kind: "element" as const,
      type: "Root",
      label: "Root",
      bounds: this.bounds(),
      z: this.z,
      visible: this.visible,
      meta: `${this.children.length} children`,
    }
  }
}

export class ModalWindow extends UIElement {
  readonly id: string
  readonly x: Signal<number>
  readonly y: Signal<number>
  readonly w: Signal<number>
  readonly h: Signal<number>
  readonly title: Signal<string>
  readonly open: Signal<boolean>
  readonly minimized: Signal<boolean>
  readonly maximized: Signal<boolean>
  readonly screenUsage: Signal<"none" | "left-half" | "right-half">
  readonly chrome: "default" | "tool"
  readonly minimizable: boolean
  readonly minW: number
  readonly minH: number
  readonly maxW: number
  readonly maxH: number
  readonly resizable: boolean
  private bodyRect: BoundsRect = { x: 0, y: 0, w: 0, h: 0 }
  private bodySurface: Surface | null = null
  private readonly bodyViewport: ViewportElement
  private bodyPadding = 0
  private bodyClip = true
  private minimizedRect: BoundsRect = { x: 0, y: 0, w: 0, h: 0 }
  private restoreRect: BoundsRect | null = null
  private maximizeBounds: BoundsRect = { x: 0, y: 0, w: 0, h: 0 }
  minimizedOrder = 0
  private hooks: WindowHooks | null = null
  private dragHooks: WindowDragHooks | null = null

  private readonly titleDownEvents = createEventStream<PointerUIEvent>()
  private readonly titleMoveEvents = createEventStream<PointerUIEvent>()
  private readonly titleUpEvents = createEventStream<PointerUIEvent>()
  private readonly titleCancelEvents = createEventStream<string>()
  private readonly titleClickEvents = createEventStream<Vec2>()
  private readonly titleMachine: Machine<TitleState, TitleEvent, TitleContext>

  readonly titleBarHeight: number

  constructor(opts: {
    id: string
    x: number
    y: number
    w: number
    h: number
    title: string
    open?: boolean
    minW?: number
    minH?: number
    maxW?: number
    maxH?: number
    resizable?: boolean
    chrome?: "default" | "tool"
    minimizable?: boolean
  }) {
    super()
    this.id = opts.id
    this.chrome = opts.chrome ?? "default"
    this.minW = Math.max(0, opts.minW ?? 0)
    this.minH = Math.max(0, opts.minH ?? 0)
    this.maxW = Math.max(this.minW, opts.maxW ?? Number.POSITIVE_INFINITY)
    this.maxH = Math.max(this.minH, opts.maxH ?? Number.POSITIVE_INFINITY)
    this.resizable = opts.resizable ?? false
    this.minimizable = opts.minimizable ?? (this.chrome !== "tool")
    this.titleBarHeight = this.chrome === "tool" ? 24 : theme.ui.titleBarHeight

    this.x = signal(opts.x)
    this.y = signal(opts.y)
    this.w = signal(clamp(opts.w, this.minW, this.maxW))
    this.h = signal(clamp(opts.h, this.minH, this.maxH))
    this.title = signal(opts.title)
    this.open = signal(opts.open ?? true)
    this.minimized = signal(false)
    this.maximized = signal(false)
    this.screenUsage = signal<"none" | "left-half" | "right-half">("none")
    this.bodyViewport = new ViewportElement({
      rect: () => this.bodyRect,
      target: this.bodySurface,
      options: {
        clip: this.bodyClip,
        padding: this.bodyPadding,
        active: () => this.open.peek() && !this.minimized.peek() && this.bodySurface !== null,
      },
    })
    this.bodyViewport.z = 1
    this.add(this.bodyViewport)
    this.add(new CloseButton(this))
    if (this.chrome === "default" && this.resizable) this.add(new MaximizeButton(this))
    if (this.minimizable) this.add(new MinimizeButton(this))
    if (this.resizable) this.add(new ResizeHandle(this))
    this.titleMachine = this.createTitleMachine()
    this.setupTitleGestures()
  }

  setHooks(hooks: WindowHooks | null) {
    this.hooks = hooks
  }

  setDragHooks(hooks: WindowDragHooks | null) {
    this.dragHooks = hooks
  }

  setBodySurface(surface: Surface | SurfaceMountSpec<unknown> | null, opts: { padding?: number; clip?: boolean } = {}) {
    this.bodySurface = isSurfaceMountSpec(surface) ? mountSurface(surface.definition, surface.props) : surface
    if (opts.padding !== undefined) this.bodyPadding = Math.max(0, opts.padding)
    if (opts.clip !== undefined) this.bodyClip = opts.clip
    this.bodyViewport.setTarget(this.bodySurface)
  }

  protected bodyBounds() {
    return this.bodyRect
  }

  getBodyBounds() {
    return this.bodyRect
  }

  snapshot(focused = false): WindowSnapshot {
    return {
      id: this.id,
      title: this.title.peek(),
      open: this.open.peek(),
      minimized: this.minimized.peek(),
      maximized: this.maximized.peek(),
      screenUsage: this.screenUsage.peek(),
      focused,
      rect: this.bounds(),
      chrome: this.chrome,
      resizable: this.resizable,
      minimizable: this.minimizable,
      zOrder: this.z,
    }
  }

  bounds(): BoundsRect {
    if (!this.open.get()) return { x: 0, y: 0, w: 0, h: 0 }
    if (this.minimized.get()) return this.minimizedRect
    return { x: this.x.get(), y: this.y.get(), w: this.w.get(), h: this.h.get() }
  }

  protected debugDescribe() {
    const rect = this.bounds()
    const parts: string[] = []
    if (this.open.peek()) parts.push(this.minimized.peek() ? "minimized" : this.maximized.peek() ? "maximized" : "open")
    else parts.push("closed")
    if (this.screenUsage.peek() !== "none") parts.push(this.screenUsage.peek())
    return {
      kind: "element" as const,
      type: this.constructor.name || "ModalWindow",
      label: this.title.peek() || this.id,
      id: this.id,
      bounds: rect,
      z: this.z,
      visible: this.visible,
      meta: parts.join(" · "),
    }
  }

  private titleBarRect(): BoundsRect {
    const b = this.bounds()
    return { x: b.x, y: b.y, w: b.w, h: this.titleBarHeight }
  }

  private currentWindowRect(): BoundsRect {
    return { x: this.x.peek(), y: this.y.peek(), w: this.w.peek(), h: this.h.peek() }
  }

  private applyWindowRect(r: BoundsRect) {
    this.x.set(r.x)
    this.y.set(r.y)
    this.w.set(clamp(r.w, this.minW, this.maxW))
    this.h.set(clamp(r.h, this.minH, this.maxH))
  }

  private startDragFromAnchoredState(pointer: Vec2) {
    const restoreRect = this.restoreRect ?? this.currentWindowRect()
    const anchor = clamp((pointer.x - this.x.peek()) / Math.max(1, this.w.peek()), 0.1, 0.9)
    this.maximized.set(false)
    this.screenUsage.set("none")
    this.applyWindowRect(restoreRect)
    const restoredW = this.w.peek()
    const restoredH = this.h.peek()
    const nx = pointer.x - restoredW * anchor
    const ny = pointer.y - Math.min(this.titleBarHeight / 2, restoredH - this.titleBarHeight)
    this.x.set(nx)
    this.y.set(ny)
    this.restoreRect = null
    const dragOffset = { x: pointer.x - this.x.peek(), y: pointer.y - this.y.peek() }
    this.hooks?.onTitleDragStart?.(this, pointer)
    this.dragHooks?.onTitleDragStart?.(this, pointer)
    this.hooks?.onStateChanged?.()
    return dragOffset
  }

  private createTitleMachine() {
    return createMachine<TitleState, TitleEvent, TitleContext>({
      initial: "idle",
      context: {
        originPointer: { x: 0, y: 0 },
        lastPointer: { x: 0, y: 0 },
        dragOffset: { x: 0, y: 0 },
        restoreFromAnchoredState: false,
      },
      states: {
        idle: {
          on: {
            PRESS: {
              target: "pressed",
              reduce: (_snapshot: TitleSnapshot, event: Extract<TitleEvent, { type: "PRESS" }>) => ({
                originPointer: event.pointer,
                lastPointer: event.pointer,
                dragOffset: { x: 0, y: 0 },
                restoreFromAnchoredState: false,
              }),
            },
            DOUBLE_CLICK: {
              guard: () => this.resizable,
              effect: () => {
                this.toggleMaximize()
              },
            },
          },
        },
        pressed: {
          on: {
            DRAG_START: {
              target: "dragging",
              reduce: (_snapshot: TitleSnapshot, event: Extract<TitleEvent, { type: "DRAG_START" }>) => ({
                lastPointer: event.pointer,
                dragOffset: event.dragOffset,
                restoreFromAnchoredState: event.restoreFromAnchoredState,
              }),
              effect: (_snapshot: TitleSnapshot, event: Extract<TitleEvent, { type: "DRAG_START" }>) => {
                if (event.restoreFromAnchoredState) return
                this.hooks?.onTitleDragStart?.(this, event.pointer)
                this.dragHooks?.onTitleDragStart?.(this, event.pointer)
              },
            },
            RELEASE: {
              target: "idle",
              reduce: (_snapshot: TitleSnapshot, event: Extract<TitleEvent, { type: "RELEASE" }>) => ({
                lastPointer: event.pointer,
              }),
            },
            CANCEL: {
              target: "idle",
            },
          },
        },
        dragging: {
          on: {
            DRAG_MOVE: {
              reduce: (_snapshot: TitleSnapshot, event: Extract<TitleEvent, { type: "DRAG_MOVE" }>) => ({
                lastPointer: event.pointer,
              }),
              effect: (snapshot: TitleSnapshot, event: Extract<TitleEvent, { type: "DRAG_MOVE" }>) => {
                const nx = event.pointer.x - snapshot.context.dragOffset.x
                const ny = event.pointer.y - snapshot.context.dragOffset.y
                this.x.set(nx)
                this.y.set(ny)
                this.hooks?.onTitleDragMove?.(this, event.pointer)
                this.dragHooks?.onTitleDragMove?.(this, event.pointer)
              },
            },
            RELEASE: {
              target: "idle",
              reduce: (_snapshot: TitleSnapshot, event: Extract<TitleEvent, { type: "RELEASE" }>) => ({
                lastPointer: event.pointer,
              }),
              effect: (_snapshot: TitleSnapshot, event: Extract<TitleEvent, { type: "RELEASE" }>) => {
                this.hooks?.onTitleDragEnd?.(this, event.pointer)
                this.dragHooks?.onTitleDragEnd?.(this, event.pointer)
              },
            },
            CANCEL: {
              target: "idle",
              effect: (snapshot: TitleSnapshot) => {
                this.hooks?.onTitleDragCancel?.(this, snapshot.context.lastPointer)
                this.dragHooks?.onTitleDragCancel?.(this, snapshot.context.lastPointer)
              },
            },
          },
        },
      },
    })
  }

  private setupTitleGestures() {
    classifyClicks({
      clicks: this.titleClickEvents.stream,
      windowMs: 320,
      canPair: (a, b) => {
        const dx = a.x - b.x
        const dy = a.y - b.y
        return dx * dx + dy * dy <= 36
      },
    })
      .filter((event) => event.kind === "double")
      .subscribe(() => {
        this.titleMachine.send({ type: "DOUBLE_CLICK" })
      })

    const titleDragMoves = this.titleMoveEvents.stream.filter((event) => (event.buttons & 1) !== 0)
    const titleCancel = interactionCancelStream({
      cancel: this.titleCancelEvents.stream,
      move: this.titleMoveEvents.stream,
      buttons: (event) => event.buttons,
    })

    const titleDrag = dragSession({
      down: this.titleDownEvents.stream,
      move: titleDragMoves,
      up: this.titleUpEvents.stream,
      cancel: titleCancel,
      point: (event) => ({ x: event.x, y: event.y }),
      thresholdSq: 16,
    })

    titleDrag.subscribe((event) => {
      if (event.kind === "start") {
        const pointer = { x: event.current.x, y: event.current.y }
        const restoreFromAnchoredState = this.maximized.peek() || this.screenUsage.peek() !== "none"
        const dragOffset = restoreFromAnchoredState
          ? this.startDragFromAnchoredState(pointer)
          : { x: event.down.x - this.x.peek(), y: event.down.y - this.y.peek() }
        this.titleMachine.send({
          type: "DRAG_START",
          pointer,
          dragOffset,
          restoreFromAnchoredState,
        })
        return
      }

      if (event.kind === "move") {
        this.titleMachine.send({ type: "DRAG_MOVE", pointer: { x: event.current.x, y: event.current.y } })
        return
      }

      if (event.kind === "cancel") {
        this.titleMachine.send({ type: "CANCEL", reason: event.reason })
        return
      }
      this.titleMachine.send({ type: "RELEASE", pointer: { x: event.up.x, y: event.up.y } })
    })
  }

  private cancelTitleInteraction(reason: string) {
    if (this.titleMachine.matches("idle")) return
    this.titleCancelEvents.emit(reason)
  }

  protected onDraw(ctx: CanvasRenderingContext2D) {
    if (!this.open.peek()) return
    const b = this.bounds()
    const x = b.x
    const y = b.y
    const w = b.w
    const h = b.h
    this.bodyRect = { x, y: y + this.titleBarHeight, w, h: Math.max(0, h - this.titleBarHeight) }

    draw(
      ctx,
      Rect(
        { x, y, w, h },
        { fill: { color: theme.colors.windowBg, shadow: theme.shadows.window }, stroke: { color: theme.colors.windowBorder, hairline: true }, pixelSnap: true },
      ),
    )

    if (this.chrome === "default") {
      draw(
        ctx,
        Rect({ x, y, w, h: this.titleBarHeight }, { fill: { color: theme.colors.windowTitleBg } }),
        Text({
          x: x + theme.spacing.sm,
          y: y + this.titleBarHeight / 2 + 0.5,
          text: this.title.peek(),
          style: { color: theme.colors.windowTitleText, font: font(theme, theme.typography.title), baseline: "middle" },
        }),
        Line({ x, y: y + this.titleBarHeight }, { x: x + w, y: y + this.titleBarHeight }, { color: theme.colors.windowDivider, hairline: true }),
      )
    } else {
      const t = this.title.peek().trim()
      if (t.length) {
        const size = Math.max(10, theme.typography.title.size - 2)
        const f = `${theme.typography.title.weight} ${size}px ${theme.typography.family}`
        draw(
          ctx,
          Text({
            x: x + theme.spacing.sm,
            y: y + this.titleBarHeight / 2 + 0.5,
            text: t.toUpperCase(),
            style: { color: theme.colors.textMuted, font: f, baseline: "middle" },
          }),
        )
      }
    }

    if (!this.minimized.peek() && this.bodySurface === null) this.drawBody(ctx, x, y + this.titleBarHeight, w, h - this.titleBarHeight)
  }

  protected drawBody(ctx: CanvasRenderingContext2D, x: number, y: number, _w: number, _h: number) {
    draw(
      ctx,
      Text({
        x: x + theme.spacing.md,
        y: y + theme.spacing.md,
        text: "Hello World",
        style: {
          color: theme.colors.textOnLightMuted,
          font: font(theme, theme.typography.body),
          baseline: "top",
        },
      }),
    )
  }

  private isInTitleBar(p: Vec2) {
    if (this.minimized.peek()) return false
    if (!pointInRect(p, this.titleBarRect())) return false
    const close = this.children.find((c) => c instanceof CloseButton) as CloseButton | undefined
    if (close && pointInRect(p, close.bounds())) return false
    const max = this.children.find((c) => c instanceof MaximizeButton) as MaximizeButton | undefined
    if (max && pointInRect(p, max.bounds())) return false
    const min = this.children.find((c) => c instanceof MinimizeButton) as MinimizeButton | undefined
    if (min && pointInRect(p, min.bounds())) return false
    return true
  }

  onPointerDown(e: PointerUIEvent) {
    if (!this.open.peek()) return
    if (e.button !== 0) return
    if (this.minimized.peek()) {
      this.restore()
      return
    }
    const p = { x: e.x, y: e.y }
    if (!this.isInTitleBar(p)) return
    this.titleMachine.send({ type: "PRESS", pointer: p })
    this.titleDownEvents.emit(e)
    e.capture()
  }

  onPointerMove(e: PointerUIEvent) {
    if (this.titleMachine.matches("idle")) return
    this.titleMoveEvents.emit(e)
  }

  onPointerUp(e: PointerUIEvent) {
    const wasPressed = this.titleMachine.matches("pressed")
    const wasDragging = this.titleMachine.matches("dragging")
    if (!wasPressed && !wasDragging) return
    this.titleUpEvents.emit(e)
    if (wasPressed) {
      this.titleMachine.send({ type: "RELEASE", pointer: { x: e.x, y: e.y } })
      this.titleClickEvents.emit({ x: e.x, y: e.y })
    }
  }

  onPointerCancel(_e: PointerUIEvent | null, reason: InteractionCancelReason) {
    this.cancelTitleInteraction(reason)
  }

  openWindow() {
    if (this.open.peek()) return
    this.open.set(true)
    this.hooks?.onStateChanged?.()
  }

  closeWindow() {
    if (!this.open.peek()) return
    this.cancelTitleInteraction("close")
    this.open.set(false)
    this.hooks?.onStateChanged?.()
  }

  toggleOpen() {
    if (this.open.peek()) this.closeWindow()
    else this.openWindow()
  }

  focusWindow() {
    this.hooks?.onFocusRequested?.()
  }

  minimize() {
    if (this.minimized.peek()) return
    this.cancelTitleInteraction("minimize")
    this.minimizedOrder = Date.now()
    this.minimized.set(true)
    this.hooks?.onStateChanged?.()
  }

  restore() {
    if (!this.minimized.peek()) return
    this.minimized.set(false)
    this.hooks?.onStateChanged?.()
  }

  setMaximizeBounds(r: BoundsRect) {
    this.maximizeBounds = r
    if (this.maximized.peek()) this.applyWindowRect(r)
  }

  maximize() {
    if (!this.resizable || this.maximized.peek()) return
    this.cancelTitleInteraction("maximize")
    if (this.screenUsage.peek() === "none" && !this.maximized.peek()) this.restoreRect = this.currentWindowRect()
    this.maximized.set(true)
    this.screenUsage.set("none")
    this.applyWindowRect(this.maximizeBounds)
    this.hooks?.onStateChanged?.()
  }

  unmaximize() {
    if (!this.maximized.peek()) return
    this.cancelTitleInteraction("unmaximize")
    this.maximized.set(false)
    this.screenUsage.set("none")
    if (this.restoreRect) this.applyWindowRect(this.restoreRect)
    this.restoreRect = null
    this.hooks?.onStateChanged?.()
  }

  useLeftHalfScreen(r: BoundsRect) {
    if (!this.resizable) return
    this.cancelTitleInteraction("left-half")
    if (!this.maximized.peek() && this.screenUsage.peek() === "none") this.restoreRect = this.currentWindowRect()
    this.maximized.set(false)
    this.screenUsage.set("left-half")
    this.applyWindowRect(r)
    this.hooks?.onStateChanged?.()
  }

  useRightHalfScreen(r: BoundsRect) {
    if (!this.resizable) return
    this.cancelTitleInteraction("right-half")
    if (!this.maximized.peek() && this.screenUsage.peek() === "none") this.restoreRect = this.currentWindowRect()
    this.maximized.set(false)
    this.screenUsage.set("right-half")
    this.applyWindowRect(r)
    this.hooks?.onStateChanged?.()
  }

  restoreScreenUsage() {
    if (this.maximized.peek()) {
      this.unmaximize()
      return
    }
    if (this.screenUsage.peek() === "none") return
    this.cancelTitleInteraction("restore-screen-usage")
    this.screenUsage.set("none")
    if (this.restoreRect) this.applyWindowRect(this.restoreRect)
    this.restoreRect = null
    this.hooks?.onStateChanged?.()
  }

  toggleMaximize() {
    if (!this.resizable) return
    if (this.maximized.peek()) this.unmaximize()
    else this.maximize()
  }

  setMinimizedRect(r: BoundsRect) {
    this.minimizedRect = r
  }

  setWindowRect(r: BoundsRect) {
    this.cancelTitleInteraction("set-rect")
    if (this.maximized.peek()) this.maximized.set(false)
    if (this.screenUsage.peek() !== "none") this.screenUsage.set("none")
    this.applyWindowRect(r)
    this.restoreRect = null
    this.hooks?.onStateChanged?.()
  }
}

export class SurfaceWindow extends ModalWindow {
  constructor(
    opts: {
      id: string
      x: number
      y: number
      w: number
      h: number
      title: string
      open?: boolean
      minW?: number
      minH?: number
      maxW?: number
      maxH?: number
      resizable?: boolean
      chrome?: "default" | "tool"
      minimizable?: boolean
      body: Surface | SurfaceMountSpec<unknown> | (() => Surface)
      bodyOptions?: { padding?: number; clip?: boolean }
    },
  ) {
    super(opts)
    this.setBodySurface(typeof opts.body === "function" ? opts.body() : opts.body, opts.bodyOptions)
  }
}

class CloseButton extends UIElement {
  private readonly win: ModalWindow
  private hover = false
  private down = false

  constructor(win: ModalWindow) {
    super()
    this.win = win
    this.z = 100
  }

  bounds(): BoundsRect {
    if (!this.win.open.get() || this.win.minimized.get()) return { x: 0, y: 0, w: 0, h: 0 }
    return titleButtonRect(this.win, 0)
  }

  protected onDraw(ctx: CanvasRenderingContext2D) {
    if (!this.win.open.peek()) return
    const r = this.bounds()
    const bg =
      this.win.chrome === "tool"
        ? this.down
          ? "rgba(233,237,243,0.12)"
          : this.hover
            ? "rgba(233,237,243,0.08)"
            : "transparent"
        : this.down
          ? theme.colors.closeDownBg
          : this.hover
            ? theme.colors.closeHoverBg
            : "transparent"
    if (bg !== "transparent") draw(ctx, Rect(r, { fill: { color: bg } }))
    const cx = r.x + r.w / 2
    const cy = r.y + r.h / 2
    const color =
      this.win.chrome === "tool" ? theme.colors.textPrimary : this.hover || this.down ? theme.colors.closeGlyphOnHover : theme.colors.closeGlyph
    const d = Math.max(3.5, Math.min(5.5, r.w / 2 - 2.5))
    draw(
      ctx,
      Line({ x: cx - d, y: cy - d }, { x: cx + d, y: cy + d }, { color, width: 1.8, lineCap: "round" }),
      Line({ x: cx + d, y: cy - d }, { x: cx - d, y: cy + d }, { color, width: 1.8, lineCap: "round" }),
    )
  }

  onPointerEnter() {
    this.hover = true
  }

  onPointerLeave() {
    this.hover = false
    this.down = false
  }

  onPointerDown(e: PointerUIEvent) {
    if (e.button !== 0) return
    this.down = true
    e.capture()
  }

  onPointerUp(_e: PointerUIEvent) {
    if (!this.down) return
    this.down = false
    if (!this.hover) return
    this.win.closeWindow()
  }

  onPointerCancel() {
    this.hover = false
    this.down = false
  }
}

class MinimizeButton extends UIElement {
  private readonly win: ModalWindow
  private hover = false
  private down = false

  constructor(win: ModalWindow) {
    super()
    this.win = win
    this.z = 100
  }

  bounds(): BoundsRect {
    if (!this.win.open.get() || this.win.minimized.get()) return { x: 0, y: 0, w: 0, h: 0 }
    return titleButtonRect(this.win, this.win.chrome === "default" && this.win.resizable ? 2 : 1)
  }

  protected onDraw(ctx: CanvasRenderingContext2D) {
    if (!this.win.open.peek() || this.win.minimized.peek()) return
    const r = this.bounds()
    const bg = this.down ? "rgba(11,15,23,0.22)" : this.hover ? "rgba(11,15,23,0.12)" : "transparent"
    if (bg !== "transparent") draw(ctx, Rect(r, { fill: { color: bg } }))
    const x0 = r.x + 5
    const x1 = r.x + r.w - 5
    const y = r.y + r.h - 6
    draw(ctx, Line({ x: x0, y }, { x: x1, y }, { color: this.win.chrome === "tool" ? theme.colors.textPrimary : theme.colors.windowTitleText, width: 1.8, lineCap: "round" }))
  }

  onPointerEnter() {
    this.hover = true
  }

  onPointerLeave() {
    this.hover = false
    this.down = false
  }

  onPointerDown(e: PointerUIEvent) {
    if (e.button !== 0) return
    this.down = true
    e.capture()
  }

  onPointerUp(_e: PointerUIEvent) {
    if (!this.down) return
    this.down = false
    if (!this.hover) return
    this.win.minimize()
  }

  onPointerCancel() {
    this.hover = false
    this.down = false
  }
}

class MaximizeButton extends UIElement {
  private readonly win: ModalWindow
  private hover = false
  private down = false

  constructor(win: ModalWindow) {
    super()
    this.win = win
    this.z = 100
  }

  bounds(): BoundsRect {
    if (!this.win.open.get() || this.win.minimized.get()) return { x: 0, y: 0, w: 0, h: 0 }
    return titleButtonRect(this.win, 1)
  }

  protected onDraw(ctx: CanvasRenderingContext2D) {
    if (!this.win.open.peek() || this.win.minimized.peek()) return
    const r = this.bounds()
    const bg = this.down ? "rgba(11,15,23,0.22)" : this.hover ? "rgba(11,15,23,0.12)" : "transparent"
    if (bg !== "transparent") draw(ctx, Rect(r, { fill: { color: bg } }))

    const color = this.win.chrome === "tool" ? theme.colors.textPrimary : theme.colors.windowTitleText
    if (this.win.maximized.peek() || this.win.screenUsage.peek() !== "none") {
      draw(
        ctx,
        Rect({ x: r.x + 5, y: r.y + 6, w: r.w - 10, h: r.h - 10 }, { stroke: { color, width: 1.4 }, pixelSnap: true }),
        Rect({ x: r.x + 7, y: r.y + 4, w: r.w - 10, h: r.h - 10 }, { stroke: { color, width: 1.4 }, pixelSnap: true }),
      )
      return
    }

    draw(ctx, Rect({ x: r.x + 5, y: r.y + 5, w: r.w - 10, h: r.h - 10 }, { stroke: { color, width: 1.4 }, pixelSnap: true }))
  }

  onPointerEnter() {
    this.hover = true
  }

  onPointerLeave() {
    this.hover = false
    this.down = false
  }

  onPointerDown(e: PointerUIEvent) {
    if (e.button !== 0) return
    this.down = true
    e.capture()
  }

  onPointerUp(_e: PointerUIEvent) {
    if (!this.down) return
    this.down = false
    if (!this.hover) return
    if (this.win.maximized.peek() || this.win.screenUsage.peek() !== "none") this.win.restoreScreenUsage()
    else this.win.toggleMaximize()
  }

  onPointerCancel() {
    this.hover = false
    this.down = false
  }
}

class ResizeHandle extends UIElement {
  private readonly win: ModalWindow
  private readonly downEvents = createEventStream<PointerUIEvent>()
  private readonly moveEvents = createEventStream<PointerUIEvent>()
  private readonly upEvents = createEventStream<PointerUIEvent>()
  private readonly cancelEvents = createEventStream<string>()
  private readonly machine: Machine<ResizeState, ResizeEvent, ResizeContext>

  constructor(win: ModalWindow) {
    super()
    this.win = win
    this.z = 100
    this.add(
      new CursorRegion({
        rect: () => this.bounds(),
        cursor: "nwse-resize",
      }),
    )
    this.machine = createMachine<ResizeState, ResizeEvent, ResizeContext>({
      initial: "idle",
      context: { originPointer: { x: 0, y: 0 }, lastPointer: { x: 0, y: 0 }, startSize: { x: 0, y: 0 } },
      states: {
        idle: {
          on: {
            PRESS: {
              target: "pressed",
              reduce: (_snapshot, event) => ({
                originPointer: event.pointer,
                lastPointer: event.pointer,
                startSize: event.startSize,
              }),
            },
          },
        },
        pressed: {
          on: {
            DRAG_START: {
              target: "dragging",
              reduce: (_snapshot, event) => ({ lastPointer: event.pointer }),
            },
            RELEASE: {
              target: "idle",
              reduce: (_snapshot, event) => ({ lastPointer: event.pointer }),
            },
            CANCEL: {
              target: "idle",
            },
          },
        },
        dragging: {
          on: {
            DRAG_MOVE: {
              reduce: (_snapshot, event) => ({ lastPointer: event.pointer }),
              effect: (snapshot, event) => {
                const nw = clamp(snapshot.context.startSize.x + (event.pointer.x - snapshot.context.originPointer.x), this.win.minW, this.win.maxW)
                const nh = clamp(snapshot.context.startSize.y + (event.pointer.y - snapshot.context.originPointer.y), this.win.minH, this.win.maxH)
                this.win.w.set(nw)
                this.win.h.set(nh)
              },
            },
            RELEASE: {
              target: "idle",
              reduce: (_snapshot, event) => ({ lastPointer: event.pointer }),
            },
            CANCEL: {
              target: "idle",
            },
          },
        },
      },
    })
    this.setupGestures()
  }

  bounds(): BoundsRect {
    if (!this.win.open.get() || this.win.minimized.get() || this.win.maximized.get()) return { x: 0, y: 0, w: 0, h: 0 }
    const size = 16
    return { x: this.win.x.get() + this.win.w.get() - size, y: this.win.y.get() + this.win.h.get() - size, w: size, h: size }
  }

  protected onDraw(ctx: CanvasRenderingContext2D) {
    if (!this.win.open.peek()) return
    const r = this.bounds()
    const color = "rgba(233,237,243,0.35)"
    const x0 = r.x + 4
    const y0 = r.y + 4
    const x1 = r.x + r.w
    const y1 = r.y + r.h
    draw(
      ctx,
      Line({ x: x0, y: y1 - 4 }, { x: x1 - 4, y: y0 }, { color, hairline: true }),
      Line({ x: x0 + 4, y: y1 - 4 }, { x: x1 - 4, y: y0 + 4 }, { color, hairline: true }),
    )
  }

  captureCursor() {
    return "nwse-resize" as const
  }

  private setupGestures() {
    const resizeMoves = this.moveEvents.stream.filter((event) => (event.buttons & 1) !== 0)
    const resizeCancel = interactionCancelStream({
      cancel: this.cancelEvents.stream,
      move: this.moveEvents.stream,
      buttons: (event) => event.buttons,
    })

    dragSession({
      down: this.downEvents.stream,
      move: resizeMoves,
      up: this.upEvents.stream,
      cancel: resizeCancel,
      point: (event) => ({ x: event.x, y: event.y }),
      thresholdSq: 0,
    }).subscribe((event) => {
      if (event.kind === "start") {
        this.machine.send({ type: "DRAG_START", pointer: { x: event.current.x, y: event.current.y } })
        return
      }
      if (event.kind === "move") {
        this.machine.send({ type: "DRAG_MOVE", pointer: { x: event.current.x, y: event.current.y } })
        return
      }
      if (event.kind === "end") {
        this.machine.send({ type: "RELEASE", pointer: { x: event.up.x, y: event.up.y } })
        return
      }
      this.machine.send({ type: "CANCEL", reason: event.reason })
    })
  }

  onPointerDown(e: PointerUIEvent) {
    if (this.win.maximized.peek()) return
    if (e.button !== 0) return
    this.machine.send({ type: "PRESS", pointer: { x: e.x, y: e.y }, startSize: { x: this.win.w.peek(), y: this.win.h.peek() } })
    this.downEvents.emit(e)
    e.capture()
  }

  onPointerMove(e: PointerUIEvent) {
    if (this.machine.matches("idle")) return
    this.moveEvents.emit(e)
  }

  onPointerUp(e: PointerUIEvent) {
    if (this.machine.matches("idle")) return
    this.upEvents.emit(e)
  }

  onPointerCancel(_e: PointerUIEvent | null, reason: InteractionCancelReason) {
    this.cancelEvents.emit(reason)
  }
}

export function constrainToCanvas(win: ModalWindow, canvasSize: Signal<Vec2>) {
  return () => {
    const size = canvasSize.get()
    const w = win.w.get()
    const h = win.h.get()
    win.x.set((x) => clamp(x, 0, Math.max(0, size.x - w)))
    win.y.set((y) => clamp(y, 0, Math.max(0, size.y - h)))
  }
}
