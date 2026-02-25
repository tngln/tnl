import { signal, type Signal } from "../../core/reactivity"
import { draw, Line, Rect, Text } from "../../core/draw"
import { font, theme } from "../../config/theme"
import { pointInRect, type Rect as BoundsRect, type Vec2, PointerUIEvent, UIElement } from "../base/ui"

function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v))
}

export class Root extends UIElement {
  bounds(): BoundsRect {
    return { x: -1e9, y: -1e9, w: 2e9, h: 2e9 }
  }

  protected onDraw(ctx: CanvasRenderingContext2D) {
    const t = ctx.getTransform()
    const dpr = Math.hypot(t.a, t.b) || 1
    const cssW = ctx.canvas.width / dpr
    const cssH = ctx.canvas.height / dpr

    const pad = theme.spacing.sm
    const gap = theme.spacing.xs
    const tileH = 26
    const tileW = 220

    const minimized: ModalWindow[] = []
    for (const child of this.children) {
      if (child instanceof ModalWindow && child.open.peek() && child.minimized.peek()) minimized.push(child)
    }
    minimized.sort((a, b) => a.minimizedOrder - b.minimizedOrder)

    let cx = pad
    let cy = cssH - pad - tileH
    for (const win of minimized) {
      if (cx + tileW > cssW - pad && cx > pad) {
        cx = pad
        cy -= tileH + gap
      }
      win.setMinimizedRect({ x: cx, y: cy, w: tileW, h: tileH })
      cx += tileW + gap
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
  readonly chrome: "default" | "tool"
  readonly minimizable: boolean
  readonly minW: number
  readonly minH: number
  readonly maxW: number
  readonly maxH: number
  readonly resizable: boolean
  private minimizedRect: BoundsRect = { x: 0, y: 0, w: 0, h: 0 }
  private restoreRect: BoundsRect | null = null
  minimizedOrder = 0

  private dragging = false
  private dragOffset: Vec2 = { x: 0, y: 0 }

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
    this.add(new CloseButton(this))
    if (this.minimizable) this.add(new MinimizeButton(this))
    if (this.resizable) this.add(new ResizeHandle(this))
  }

  bounds(): BoundsRect {
    if (!this.open.get()) return { x: 0, y: 0, w: 0, h: 0 }
    if (this.minimized.get()) return this.minimizedRect
    return { x: this.x.get(), y: this.y.get(), w: this.w.get(), h: this.h.get() }
  }

  private titleBarRect(): BoundsRect {
    const b = this.bounds()
    return { x: b.x, y: b.y, w: b.w, h: this.titleBarHeight }
  }

  protected onDraw(ctx: CanvasRenderingContext2D) {
    if (!this.open.peek()) return
    const b = this.bounds()
    const x = b.x
    const y = b.y
    const w = b.w
    const h = b.h

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

    if (!this.minimized.peek()) this.drawBody(ctx, x, y + this.titleBarHeight, w, h - this.titleBarHeight)
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
    this.dragging = true
    this.dragOffset = { x: p.x - this.x.peek(), y: p.y - this.y.peek() }
    e.capture()
  }

  onPointerMove(e: PointerUIEvent) {
    if (!this.dragging) return
    const nx = e.x - this.dragOffset.x
    const ny = e.y - this.dragOffset.y
    this.x.set(nx)
    this.y.set(ny)
  }

  onPointerUp(_e: PointerUIEvent) {
    this.dragging = false
  }

  minimize() {
    if (this.minimized.peek()) return
    this.restoreRect = { x: this.x.peek(), y: this.y.peek(), w: this.w.peek(), h: this.h.peek() }
    this.minimizedOrder = Date.now()
    this.minimized.set(true)
  }

  restore() {
    if (!this.minimized.peek()) return
    this.minimized.set(false)
    const r = this.restoreRect
    if (!r) return
    this.x.set(r.x)
    this.y.set(r.y)
    this.w.set(clamp(r.w, this.minW, this.maxW))
    this.h.set(clamp(r.h, this.minH, this.maxH))
  }

  setMinimizedRect(r: BoundsRect) {
    this.minimizedRect = r
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
    const pad = this.win.chrome === "tool" ? 6 : theme.ui.closeButtonPad
    const size = this.win.titleBarHeight - pad * 2
    return {
      x: this.win.x.get() + this.win.w.get() - pad - size,
      y: this.win.y.get() + pad,
      w: size,
      h: size,
    }
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
    this.win.open.set(false)
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
    const pad = this.win.chrome === "tool" ? 6 : theme.ui.closeButtonPad
    const size = this.win.titleBarHeight - pad * 2
    return {
      x: this.win.x.get() + this.win.w.get() - pad - size * 2 - 2,
      y: this.win.y.get() + pad,
      w: size,
      h: size,
    }
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
}

class ResizeHandle extends UIElement {
  private readonly win: ModalWindow
  private drag = false
  private start: Vec2 = { x: 0, y: 0 }
  private startSize: Vec2 = { x: 0, y: 0 }

  constructor(win: ModalWindow) {
    super()
    this.win = win
    this.z = 100
  }

  bounds(): BoundsRect {
    if (!this.win.open.get() || this.win.minimized.get()) return { x: 0, y: 0, w: 0, h: 0 }
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

  onPointerDown(e: PointerUIEvent) {
    if (e.button !== 0) return
    this.drag = true
    this.start = { x: e.x, y: e.y }
    this.startSize = { x: this.win.w.peek(), y: this.win.h.peek() }
    e.capture()
  }

  onPointerMove(e: PointerUIEvent) {
    if (!this.drag) return
    const nw = clamp(this.startSize.x + (e.x - this.start.x), this.win.minW, this.win.maxW)
    const nh = clamp(this.startSize.y + (e.y - this.start.y), this.win.minH, this.win.maxH)
    this.win.w.set(nw)
    this.win.h.set(nh)
  }

  onPointerUp(_e: PointerUIEvent) {
    this.drag = false
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

