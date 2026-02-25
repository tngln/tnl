import { signal, type Signal } from "../../core/reactivity"
import { draw, Line, Rect as RectOp, RRect } from "../../core/draw"
import { theme } from "../../config/theme"
import { UIElement, type Rect, type Vec2, PointerUIEvent, pointInRect } from "../base/ui"
import { ViewportElement, type Surface, type ViewportContext } from "../base/viewport"

type Axis = "x" | "y"

class SurfaceRoot extends UIElement {
  bounds(): Rect {
    return { x: -1e9, y: -1e9, w: 2e9, h: 2e9 }
  }
}

function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v))
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
  private start = 0
  private startPos = 0

  constructor(opts: { rect: () => Rect; axis: Axis; position: Signal<number>; minA: () => number; minB: () => number; total: () => number }) {
    super()
    this.rect = opts.rect
    this.axis = opts.axis
    this.position = opts.position
    this.minA = opts.minA
    this.minB = opts.minB
    this.total = opts.total
    this.z = 50
  }

  bounds(): Rect {
    return this.rect()
  }

  protected containsPoint(p: Vec2) {
    return pointInRect(p, this.rect())
  }

  protected onDraw(ctx: CanvasRenderingContext2D) {
    const r = this.rect()
    const bg = this.down ? "rgba(255,255,255,0.08)" : this.hover ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.04)"
    draw(
      ctx,
      RectOp(r, { fill: { color: bg } }),
      RRect({ x: r.x + 1, y: r.y + 1, w: r.w - 2, h: r.h - 2, r: 6 }, { stroke: { color: "rgba(255,255,255,0.10)", hairline: true }, pixelSnap: true }),
    )
    if (this.axis === "x") {
      const x = r.x + r.w / 2
      const y0 = r.y + 8
      const y1 = r.y + r.h - 8
      draw(ctx, Line({ x, y: y0 }, { x, y: y1 }, { color: "rgba(255,255,255,0.18)", width: 2, lineCap: "round" }))
    } else {
      const y = r.y + r.h / 2
      const x0 = r.x + 8
      const x1 = r.x + r.w - 8
      draw(ctx, Line({ x: x0, y }, { x: x1, y }, { color: "rgba(255,255,255,0.18)", width: 2, lineCap: "round" }))
    }
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
    this.start = this.axis === "x" ? e.x : e.y
    this.startPos = this.position.peek()
    e.capture()
  }

  onPointerMove(e: PointerUIEvent) {
    if (!this.down) return
    const cur = this.axis === "x" ? e.x : e.y
    const delta = cur - this.start
    const total = this.total()
    const minA = this.minA()
    const minB = this.minB()
    const next = clamp(this.startPos + delta, minA, Math.max(minA, total - minB))
    this.position.set(next)
  }

  onPointerUp(_e: PointerUIEvent) {
    this.down = false
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
    this.position = signal(opts.initial ?? 220)

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
