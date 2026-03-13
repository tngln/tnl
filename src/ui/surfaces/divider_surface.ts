import { theme } from "@/config/theme"
import { draw, RectOp } from "@/core/draw"
import { createEventStream, dragSession, interactionCancelStream, type InteractionCancelReason } from "@/core/event_stream"
import { signal, type Signal } from "@/core/reactivity"
import { clamp } from "@/core/rect"
import { CursorRegion, UIElement, type Rect, type Vec2, PointerUIEvent, pointInRect } from "@/ui/base/ui"
import { ViewportElement, SurfaceRoot, type Surface, type ViewportContext } from "@/ui/base/viewport"

type Axis = "x" | "y"
type DividerHandleChrome = {
  fill: string
  stroke: string
  grip: string
}
type DividerHandleMetrics = {
  frame: { x: number; y: number; w: number; h: number; r: number }
  grip: { x: number; y: number; w: number; h: number; r: number }
}

class DividerHandle extends UIElement {
  private readonly rect: () => Rect
  private readonly axis: Axis
  private readonly position: Signal<number>
  private readonly minA: () => number
  private readonly minB: () => number
  private readonly total: () => number

  private hover = false
  private down = false
  private startPos = 0
  private readonly downEvents = createEventStream<PointerUIEvent>()
  private readonly moveEvents = createEventStream<PointerUIEvent>()
  private readonly upEvents = createEventStream<PointerUIEvent>()
  private readonly cancelEvents = createEventStream<string>()

  constructor(opts: { rect: () => Rect; axis: Axis; position: Signal<number>; minA: () => number; minB: () => number; total: () => number }) {
    super()
    this.rect = opts.rect
    this.axis = opts.axis
    this.position = opts.position
    this.minA = opts.minA
    this.minB = opts.minB
    this.total = opts.total
    this.z = 50
    this.add(
      new CursorRegion({
        rect: () => this.rect(),
        cursor: this.axis === "x" ? "ew-resize" : "ns-resize",
      }),
    )
    this.setupGestures()
  }

  bounds(): Rect {
    return this.rect()
  }

  protected containsPoint(p: Vec2) {
    return pointInRect(p, this.rect())
  }

  private chrome(): DividerHandleChrome {
    return {
      fill: this.down ? theme.colors.white08 : this.hover ? theme.colors.white06 : theme.colors.white04,
      stroke: theme.colors.white10,
      grip: theme.colors.white18,
    }
  }

  private metrics(): DividerHandleMetrics {
    const r = this.rect()
    const inset = 1
    const gripInset = 8
    const gripThickness = 4
    if (this.axis === "x") {
      return {
        frame: { x: r.x + inset, y: r.y + inset, w: Math.max(0, r.w - inset * 2), h: Math.max(0, r.h - inset * 2), r: 6 },
        grip: {
          x: r.x + Math.max(0, (r.w - gripThickness) / 2),
          y: r.y + gripInset,
          w: gripThickness,
          h: Math.max(0, r.h - gripInset * 2),
          r: gripThickness / 2,
        },
      }
    }
    return {
      frame: { x: r.x + inset, y: r.y + inset, w: Math.max(0, r.w - inset * 2), h: Math.max(0, r.h - inset * 2), r: 6 },
      grip: {
        x: r.x + gripInset,
        y: r.y + Math.max(0, (r.h - gripThickness) / 2),
        w: Math.max(0, r.w - gripInset * 2),
        h: gripThickness,
        r: gripThickness / 2,
      },
    }
  }

  protected onDraw(ctx: CanvasRenderingContext2D) {
    const chrome = this.chrome()
    const metrics = this.metrics()
    draw(
      ctx,
      RectOp({ x: metrics.frame.x, y: metrics.frame.y, w: metrics.frame.w, h: metrics.frame.h }, {
        radius: metrics.frame.r,
        fill: { color: chrome.fill },
        stroke: { color: chrome.stroke, hairline: true },
        pixelSnap: true,
      }),
      RectOp({ x: metrics.grip.x, y: metrics.grip.y, w: metrics.grip.w, h: metrics.grip.h }, {
        radius: metrics.grip.r,
        fill: { color: chrome.grip },
        pixelSnap: true,
      }),
    )
  }

  private setupGestures() {
    const dragMoves = this.moveEvents.stream.filter((event) => (event.buttons & 1) !== 0)
    const cancel = interactionCancelStream({
      cancel: this.cancelEvents.stream,
      move: this.moveEvents.stream,
      buttons: (event) => event.buttons,
    })

    dragSession({
      down: this.downEvents.stream,
      move: dragMoves,
      up: this.upEvents.stream,
      cancel,
      point: (event) => ({ x: event.x, y: event.y }),
      thresholdSq: 0,
    }).subscribe((event) => {
      if (event.kind === "start") {
        this.startPos = this.position.peek()
        return
      }
      if (event.kind === "end" || event.kind === "cancel") {
        this.down = false
        return
      }
      const start = this.axis === "x" ? event.down.x : event.down.y
      const cur = this.axis === "x" ? event.current.x : event.current.y
      const delta = cur - start
      const total = this.total()
      const minA = this.minA()
      const minB = this.minB()
      const next = clamp(this.startPos + delta, minA, Math.max(minA, total - minB))
      this.position.set(next)
    })
  }

  captureCursor() {
    return this.axis === "x" ? "ew-resize" : "ns-resize"
  }

  onPointerEnter() {
    this.hover = true
  }

  onPointerLeave() {
    this.hover = false
  }

  onPointerDown(e: PointerUIEvent) {
    if (e.button !== 0) return
    this.down = true
    this.downEvents.emit(e)
    e.capture()
  }

  onPointerMove(e: PointerUIEvent) {
    if (!this.down) return
    this.moveEvents.emit(e)
  }

  onPointerUp(e: PointerUIEvent) {
    this.upEvents.emit(e)
    this.down = false
  }

  onPointerCancel(_e: PointerUIEvent | null, reason: InteractionCancelReason) {
    this.cancelEvents.emit(reason)
    this.down = false
    this.hover = false
  }
}

export class DividerSurface implements Surface {
  readonly id: string
  private readonly root = new SurfaceRoot()
  private size: Vec2 = { x: 0, y: 0 }

  private readonly axis: Axis
  private readonly position: Signal<number>
  private readonly minA: number
  private readonly minB: number
  private readonly gutter: number

  private readonly aViewport: ViewportElement
  private readonly bViewport: ViewportElement

  constructor(opts: { id: string; axis?: Axis; a: Surface; b: Surface; initial?: number; minA?: number; minB?: number; gutter?: number }) {
    this.id = opts.id
    this.axis = opts.axis ?? "x"
    this.minA = opts.minA ?? 160
    this.minB = opts.minB ?? 160
    this.gutter = Math.max(8, opts.gutter ?? 10)
    this.position = signal(opts.initial ?? 220, { debugLabel: `divider.${opts.id}.position` })

    const aRect = () => {
      if (this.axis === "x") return { x: 0, y: 0, w: clamp(this.position.peek(), 0, Math.max(0, this.size.x - this.gutter)), h: this.size.y }
      return { x: 0, y: 0, w: this.size.x, h: clamp(this.position.peek(), 0, Math.max(0, this.size.y - this.gutter)) }
    }
    const handleRect = () => {
      if (this.axis === "x") return { x: aRect().w, y: 0, w: this.gutter, h: this.size.y }
      return { x: 0, y: aRect().h, w: this.size.x, h: this.gutter }
    }
    const bRect = () => {
      if (this.axis === "x") return { x: aRect().w + this.gutter, y: 0, w: Math.max(0, this.size.x - aRect().w - this.gutter), h: this.size.y }
      return { x: 0, y: aRect().h + this.gutter, w: this.size.x, h: Math.max(0, this.size.y - aRect().h - this.gutter) }
    }

    this.aViewport = new ViewportElement({ rect: aRect, target: opts.a, options: { clip: true, padding: theme.spacing.sm } })
    this.bViewport = new ViewportElement({ rect: bRect, target: opts.b, options: { clip: true, padding: theme.spacing.sm } })
    this.aViewport.z = 1
    this.bViewport.z = 1
    this.root.add(this.aViewport)
    this.root.add(this.bViewport)

    this.root.add(
      new DividerHandle({
        rect: handleRect,
        axis: this.axis,
        position: this.position,
        minA: () => this.minA,
        minB: () => this.minB,
        total: () => (this.axis === "x" ? this.size.x : this.size.y),
      }),
    )
  }

  render(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, viewport: ViewportContext) {
    this.size = { x: viewport.contentRect.w, y: viewport.contentRect.h }
    const total = this.axis === "x" ? this.size.x : this.size.y
    const maxPos = Math.max(this.minA, total - this.minB)
    const next = clamp(this.position.peek(), this.minA, maxPos)
    if (next !== this.position.peek()) this.position.set(next)
    this.root.draw(ctx as any)
  }

  hitTest(pSurface: Vec2) {
    return this.root.hitTest(pSurface)
  }
}
