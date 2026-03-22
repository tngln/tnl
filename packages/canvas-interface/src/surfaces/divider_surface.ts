import { theme, neutral } from "../theme"
import { draw, RectOp, clamp } from "../draw"
import { signal, type Signal } from "../reactivity"
import { UIElement } from "../ui/ui_base"
import { CursorRegion } from "../ui/ui.element"
import { pointInRect } from "../ui/ui.hit_test"
import { SurfaceRoot, type Surface, type ViewportContext, ViewportElement } from "../ui/viewport"
import { useDragHandle } from "../use/use_drag_handle"
import type { Rect, Vec2 } from "../draw"

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

  private startPos = 0
  private readonly drag = useDragHandle(this, {
    thresholdSq: 0,
    onDragStart: () => {
      this.startPos = this.position.peek()
    },
    onDragMove: ({ origin, current }) => {
      const start = this.axis === "x" ? origin.x : origin.y
      const cur = this.axis === "x" ? current.x : current.y
      const delta = cur - start
      const total = this.total()
      const minA = this.minA()
      const minB = this.minB()
      const next = clamp(this.startPos + delta, minA, Math.max(minA, total - minB))
      this.position.set(next)
    },
  })

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
  }

  bounds(): Rect {
    return this.rect()
  }

  protected containsPoint(p: Vec2) {
    return pointInRect(p, this.rect())
  }

  private chrome(): DividerHandleChrome {
    return {
      fill: this.drag.pressed() || this.drag.dragging() ? neutral[500] : this.hover ? neutral[600] : neutral[700],
      stroke: neutral[400],
      grip: neutral[200],
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
        fill: { paint: chrome.fill },
        stroke: { color: chrome.stroke, hairline: true },
      }),
      RectOp({ x: metrics.grip.x, y: metrics.grip.y, w: metrics.grip.w, h: metrics.grip.h }, {
        radius: metrics.grip.r,
        fill: { paint: chrome.grip },
      }),
    )
  }

  captureCursor() {
    return this.axis === "x" ? "ew-resize" : "ns-resize"
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
  private invalidateSurface: () => void = () => {}

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

  setInvalidator(fn: (() => void) | null) {
    this.invalidateSurface = fn ?? (() => {})
  }

  render(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, viewport: ViewportContext) {
    this.size = { x: viewport.contentRect.w, y: viewport.contentRect.h }
    const total = this.axis === "x" ? this.size.x : this.size.y
    const maxPos = Math.max(this.minA, total - this.minB)
    const next = clamp(this.position.peek(), this.minA, maxPos)
    if (next !== this.position.peek()) this.position.set(next)
    this.root.draw(ctx as any, {
      frameId: 0,
      dpr: viewport.dpr,
      invalidateRect: () => this.invalidateSurface(),
    })
  }

  hitTest(pSurface: Vec2) {
    return this.root.hitTest(pSurface)
  }
}
