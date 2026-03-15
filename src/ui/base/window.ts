import { font, theme, neutral, alpha } from "@/config/theme"
import { draw, LineOp, RectOp, TextOp } from "@/core/draw"
import type { InteractionCancelReason } from "@/core/event_stream"
import { signal, type Signal } from "@/core/reactivity"
import { clamp, ZERO_RECT } from "@/core/rect"
import { CursorRegion, pointInRect, type DebugEventListenerSnapshot, type Rect as BoundsRect, type Vec2, PointerUIEvent, UIElement } from "@/ui/base/ui"
import { ViewportElement, type Surface } from "@/ui/base/viewport"
import { isSurfaceMountSpec, mountSurface, type SurfaceMountSpec } from "@/ui/builder/surface_builder"

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

type TitleContext = {
  originPointer: Vec2
  dragOffset: Vec2
}

const TITLE_BUTTON_GAP = 2
const TITLE_DRAG_THRESHOLD_SQ = 16
const TITLE_DOUBLE_CLICK_WINDOW_MS = 320
const TITLE_DOUBLE_CLICK_DIST_SQ = 36

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
  private bodyRect: BoundsRect = ZERO_RECT
  private bodySurface: Surface | null = null
  private readonly bodyViewport: ViewportElement
  private bodyPadding = 0
  private bodyClip = true
  private minimizedRect: BoundsRect = ZERO_RECT
  private restoreRect: BoundsRect | null = null
  private maximizeBounds: BoundsRect = ZERO_RECT
  minimizedOrder = 0
  private hooks: WindowHooks | null = null
  private dragHooks: WindowDragHooks | null = null

  private titleInteraction: {
    pressed: boolean
    dragging: boolean
    context: TitleContext
    lastPointer: Vec2
    lastClickAt: number
    lastClickPos: Vec2 | null
  } = {
    pressed: false,
    dragging: false,
    context: { originPointer: { x: 0, y: 0 }, dragOffset: { x: 0, y: 0 } },
    lastPointer: { x: 0, y: 0 },
    lastClickAt: 0,
    lastClickPos: null,
  }

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

    this.x = signal(opts.x, { debugLabel: `window.${opts.id}.x` })
    this.y = signal(opts.y, { debugLabel: `window.${opts.id}.y` })
    this.w = signal(clamp(opts.w, this.minW, this.maxW), { debugLabel: `window.${opts.id}.w` })
    this.h = signal(clamp(opts.h, this.minH, this.maxH), { debugLabel: `window.${opts.id}.h` })
    this.title = signal(opts.title, { debugLabel: `window.${opts.id}.title` })
    this.open = signal(opts.open ?? true, { debugLabel: `window.${opts.id}.open` })
    this.minimized = signal(false, { debugLabel: `window.${opts.id}.minimized` })
    this.maximized = signal(false, { debugLabel: `window.${opts.id}.maximized` })
    this.screenUsage = signal<"none" | "left-half" | "right-half">("none", { debugLabel: `window.${opts.id}.screenUsage` })
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
    this.add(new TitleBarButton(this, CLOSE_BUTTON_SPEC))
    this.add(new TitleBarButton(this, MAXIMIZE_BUTTON_SPEC))
    this.add(new TitleBarButton(this, MINIMIZE_BUTTON_SPEC))
    if (this.resizable) this.add(new ResizeHandle(this))
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
    if (!this.open.get()) return ZERO_RECT
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

  private cancelTitleInteraction(reason: string) {
    const s = this.titleInteraction
    if (!s.pressed && !s.dragging) return
    // Preserve the old behavior: only an active drag produces cancel hooks.
    if (s.dragging) {
      this.hooks?.onTitleDragCancel?.(this, s.lastPointer)
      this.dragHooks?.onTitleDragCancel?.(this, s.lastPointer)
    }
    s.pressed = false
    s.dragging = false
    s.context.originPointer = { x: 0, y: 0 }
    s.context.dragOffset = { x: 0, y: 0 }
    s.lastPointer = { x: 0, y: 0 }
    void reason
  }

  private handleTitleClick(point: Vec2) {
    if (!this.resizable) return
    const s = this.titleInteraction
    const now = Date.now()
    if (s.lastClickAt > 0 && now - s.lastClickAt <= TITLE_DOUBLE_CLICK_WINDOW_MS && s.lastClickPos) {
      const dx = point.x - s.lastClickPos.x
      const dy = point.y - s.lastClickPos.y
      if (dx * dx + dy * dy <= TITLE_DOUBLE_CLICK_DIST_SQ) {
        s.lastClickAt = 0
        s.lastClickPos = null
        this.toggleMaximize()
        return
      }
    }
    s.lastClickAt = now
    s.lastClickPos = point
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
      RectOp(
        { x, y, w, h },
        { fill: { color: neutral[875], shadow: theme.shadows.window }, stroke: { color: theme.colors.border, hairline: true } },
      ),
    )

    if (this.chrome === "default") {
      draw(
        ctx,
        RectOp({ x, y, w, h: this.titleBarHeight }, { fill: { color: neutral[50] } }),
        TextOp({
          x: x + theme.spacing.sm,
          y: y + this.titleBarHeight / 2 + 0.5,
          text: this.title.peek(),
          style: { color: neutral[925], font: font(theme, theme.typography.title), baseline: "middle" },
        }),
        LineOp({ x, y: y + this.titleBarHeight }, { x: x + w, y: y + this.titleBarHeight }, { color: neutral[850], hairline: true }),
      )
    } else {
      const t = this.title.peek().trim()
      if (t.length) {
        const size = Math.max(10, theme.typography.title.size - 2)
        const f = `${theme.typography.title.weight} ${size}px ${theme.typography.family}`
        draw(
          ctx,
          TextOp({
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
      TextOp({
        x: x + theme.spacing.md,
        y: y + theme.spacing.md,
        text: "Hello World",
        style: {
          color: alpha(neutral[925], 0.65),
          font: font(theme, theme.typography.body),
          baseline: "top",
        },
      }),
    )
  }

  private isInTitleBar(p: Vec2) {
    if (this.minimized.peek()) return false
    if (!pointInRect(p, this.titleBarRect())) return false
    for (const child of this.children) {
      if (!(child instanceof TitleBarButton)) continue
      if (pointInRect(p, child.bounds())) return false
    }
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
    const s = this.titleInteraction
    s.pressed = true
    s.dragging = false
    s.context.originPointer = p
    s.context.dragOffset = { x: 0, y: 0 }
    s.lastPointer = p
    e.capture()
  }

  onPointerMove(e: PointerUIEvent) {
    const s = this.titleInteraction
    if (!s.pressed && !s.dragging) return
    if ((e.buttons & 1) === 0) return
    const pointer = { x: e.x, y: e.y }
    s.lastPointer = pointer

    if (!s.dragging) {
      const dx = pointer.x - s.context.originPointer.x
      const dy = pointer.y - s.context.originPointer.y
      if (dx * dx + dy * dy < TITLE_DRAG_THRESHOLD_SQ) return

      const restoreFromAnchoredState = this.maximized.peek() || this.screenUsage.peek() !== "none"
      const dragOffset = restoreFromAnchoredState
        ? this.startDragFromAnchoredState(pointer)
        : { x: s.context.originPointer.x - this.x.peek(), y: s.context.originPointer.y - this.y.peek() }
      s.context.dragOffset = dragOffset
      s.dragging = true
      if (!restoreFromAnchoredState) {
        this.hooks?.onTitleDragStart?.(this, pointer)
        this.dragHooks?.onTitleDragStart?.(this, pointer)
      }
    }

    const nx = pointer.x - s.context.dragOffset.x
    const ny = pointer.y - s.context.dragOffset.y
    this.x.set(nx)
    this.y.set(ny)
    this.hooks?.onTitleDragMove?.(this, pointer)
    this.dragHooks?.onTitleDragMove?.(this, pointer)
  }

  onPointerUp(e: PointerUIEvent) {
    const s = this.titleInteraction
    if (!s.pressed && !s.dragging) return
    const pointer = { x: e.x, y: e.y }
    s.lastPointer = pointer

    if (s.dragging) {
      this.hooks?.onTitleDragEnd?.(this, pointer)
      this.dragHooks?.onTitleDragEnd?.(this, pointer)
    } else if (s.pressed) {
      this.handleTitleClick(pointer)
    }

    s.pressed = false
    s.dragging = false
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

type TitleBarButtonSpec = {
  kind: "close" | "minimize" | "maximize"
  visible: (win: ModalWindow) => boolean
  slotFromRight: (win: ModalWindow) => number
  draw: (ctx: CanvasRenderingContext2D, r: BoundsRect, win: ModalWindow, state: { hover: boolean; down: boolean }) => void
  onClick: (win: ModalWindow) => void
}

const CLOSE_BUTTON_SPEC: TitleBarButtonSpec = {
  kind: "close",
  visible: () => true,
  slotFromRight: () => 0,
  draw: (ctx, r, win, state) => {
    const bg =
      win.chrome === "tool"
        ? state.down
          ? theme.colors.pressed
          : state.hover
            ? theme.colors.hover
            : "transparent"
        : state.down
          ? theme.colors.closeBgPressed
          : state.hover
            ? theme.colors.closeBg
            : "transparent"
    if (bg !== "transparent") draw(ctx, RectOp(r, { fill: { color: bg } }))
    const cx = r.x + r.w / 2
    const cy = r.y + r.h / 2
    const color = win.chrome === "tool" ? theme.colors.text : state.hover || state.down ? neutral[50] : neutral[925]
    const d = Math.max(3.5, Math.min(5.5, r.w / 2 - 2.5))
    draw(
      ctx,
      LineOp({ x: cx - d, y: cy - d }, { x: cx + d, y: cy + d }, { color, width: 1.8, lineCap: "round" }),
      LineOp({ x: cx + d, y: cy - d }, { x: cx - d, y: cy + d }, { color, width: 1.8, lineCap: "round" }),
    )
  },
  onClick: (win) => win.closeWindow(),
}

const MINIMIZE_BUTTON_SPEC: TitleBarButtonSpec = {
  kind: "minimize",
  visible: (win) => win.minimizable,
  slotFromRight: (win) => (win.chrome === "default" && win.resizable ? 2 : 1),
  draw: (ctx, r, win, state) => {
    const bg = state.down ? neutral[750] : state.hover ? neutral[800] : "transparent"
    if (bg !== "transparent") draw(ctx, RectOp(r, { fill: { color: bg } }))
    const x0 = r.x + 5
    const x1 = r.x + r.w - 5
    const y = r.y + r.h - 6
    draw(ctx, LineOp({ x: x0, y }, { x: x1, y }, { color: win.chrome === "tool" ? theme.colors.text : neutral[925], width: 1.8, lineCap: "round" }))
  },
  onClick: (win) => win.minimize(),
}

const MAXIMIZE_BUTTON_SPEC: TitleBarButtonSpec = {
  kind: "maximize",
  visible: (win) => win.chrome === "default" && win.resizable,
  slotFromRight: () => 1,
  draw: (ctx, r, win, state) => {
    const bg = state.down ? neutral[750] : state.hover ? neutral[800] : "transparent"
    if (bg !== "transparent") draw(ctx, RectOp(r, { fill: { color: bg } }))

    const color = win.chrome === "tool" ? theme.colors.text : neutral[925]
    if (win.maximized.peek() || win.screenUsage.peek() !== "none") {
      draw(
        ctx,
        RectOp({ x: r.x + 5, y: r.y + 6, w: r.w - 10, h: r.h - 10 }, { stroke: { color, width: 1.4 } }),
        RectOp({ x: r.x + 7, y: r.y + 4, w: r.w - 10, h: r.h - 10 }, { stroke: { color, width: 1.4 } }),
      )
      return
    }

    draw(ctx, RectOp({ x: r.x + 5, y: r.y + 5, w: r.w - 10, h: r.h - 10 }, { stroke: { color, width: 1.4 } }))
  },
  onClick: (win) => {
    if (win.maximized.peek() || win.screenUsage.peek() !== "none") win.restoreScreenUsage()
    else win.toggleMaximize()
  },
}

class TitleBarButton extends UIElement {
  private hover = false
  private down = false

  constructor(
    private readonly win: ModalWindow,
    private readonly spec: TitleBarButtonSpec,
  ) {
    super()
    this.z = 100
  }

  bounds(): BoundsRect {
    if (!this.spec.visible(this.win)) return ZERO_RECT
    if (!this.win.open.get() || this.win.minimized.get()) return ZERO_RECT
    return titleButtonRect(this.win, this.spec.slotFromRight(this.win))
  }

  protected onDraw(ctx: CanvasRenderingContext2D) {
    if (!this.win.open.peek() || this.win.minimized.peek()) return
    if (!this.spec.visible(this.win)) return
    const r = this.bounds()
    this.spec.draw(ctx, r, this.win, { hover: this.hover, down: this.down })
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
    this.spec.onClick(this.win)
  }

  onPointerCancel() {
    this.hover = false
    this.down = false
  }

  protected debugListeners(): DebugEventListenerSnapshot[] | null {
    return [{ id: "click", label: "Click" }]
  }
}

class ResizeHandle extends UIElement {
  private readonly win: ModalWindow
  private resizing = false
  private originPointer: Vec2 = { x: 0, y: 0 }
  private startSize: Vec2 = { x: 0, y: 0 }

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
  }

  bounds(): BoundsRect {
    if (!this.win.open.get() || this.win.minimized.get() || this.win.maximized.get()) return ZERO_RECT
    const size = 16
    return { x: this.win.x.get() + this.win.w.get() - size, y: this.win.y.get() + this.win.h.get() - size, w: size, h: size }
  }

  protected onDraw(ctx: CanvasRenderingContext2D) {
    if (!this.win.open.peek()) return
    const r = this.bounds()
    const color = theme.colors.textDim
    const x0 = r.x + 4
    const y0 = r.y + 4
    const x1 = r.x + r.w
    const y1 = r.y + r.h
    draw(
      ctx,
      LineOp({ x: x0, y: y1 - 4 }, { x: x1 - 4, y: y0 }, { color, hairline: true }),
      LineOp({ x: x0 + 4, y: y1 - 4 }, { x: x1 - 4, y: y0 + 4 }, { color, hairline: true }),
    )
  }

  captureCursor() {
    return "nwse-resize" as const
  }

  onPointerDown(e: PointerUIEvent) {
    if (this.win.maximized.peek()) return
    if (e.button !== 0) return
    this.resizing = true
    this.originPointer = { x: e.x, y: e.y }
    this.startSize = { x: this.win.w.peek(), y: this.win.h.peek() }
    e.capture()
  }

  onPointerMove(e: PointerUIEvent) {
    if (!this.resizing) return
    if ((e.buttons & 1) === 0) return
    const nw = clamp(this.startSize.x + (e.x - this.originPointer.x), this.win.minW, this.win.maxW)
    const nh = clamp(this.startSize.y + (e.y - this.originPointer.y), this.win.minH, this.win.maxH)
    this.win.w.set(nw)
    this.win.h.set(nh)
  }

  onPointerUp(e: PointerUIEvent) {
    if (!this.resizing) return
    void e
    this.resizing = false
  }

  onPointerCancel(_e: PointerUIEvent | null, reason: InteractionCancelReason) {
    void reason
    this.resizing = false
  }

  protected debugListeners(): DebugEventListenerSnapshot[] | null {
    return [{ id: "drag.resize", label: "Drag (resize)" }]
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
