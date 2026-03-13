import { clamp, ZERO_RECT } from "@/core/rect"
import { UIElement, type Rect, type Vec2, WheelUIEvent } from "@/ui/base/ui"
import { type Surface, ViewportElement } from "@/ui/base/viewport"
import type { BuilderNode } from "@/ui/builder/types"
import type { WidgetDescriptor } from "@/ui/builder/widget_registry"
import { Scrollbar } from "./scrollbar"

type BuilderTreeSurfaceLike = Surface & {
  setNode(node: BuilderNode | null): void
  setWheelFallback(fn: ((e: WheelUIEvent) => void) | null): void
  contentSize(viewportSize: Vec2): Vec2
  measureWithContext(ctx: CanvasRenderingContext2D, viewportSize: Vec2): Vec2
}

export class ScrollArea extends UIElement {
  private rect: Rect = ZERO_RECT
  private active = false
  private contentSurface: BuilderTreeSurfaceLike | null = null
  private viewport: ViewportElement | null = null
  private scrollbar: Scrollbar | null = null
  private scrollY = 0
  private contentH = 0

  constructor(private readonly id: string) {
    super()
  }

  private maxScroll() {
    return Math.max(0, this.contentH - this.rect.h)
  }

  private onContentWheel(e: WheelUIEvent) {
    const next = clamp(this.scrollY + e.deltaY, 0, this.maxScroll())
    if (next === this.scrollY) return
    this.scrollY = next
    e.handle()
  }

  private ensure(createTreeSurface: (id: string) => BuilderTreeSurfaceLike) {
    if (this.contentSurface) return
    this.contentSurface = createTreeSurface(`${this.id}.Content`)
    this.contentSurface.setWheelFallback((e) => this.onContentWheel(e))
    this.viewport = new ViewportElement({
      rect: () => this.rect,
      target: this.contentSurface,
      options: { clip: true, scroll: () => ({ x: 0, y: this.scrollY }), active: () => this.active },
    })
    this.viewport.z = 1
    this.scrollbar = new Scrollbar({
      rect: () => ({
        x: this.rect.x + Math.max(0, this.rect.w - 12),
        y: this.rect.y + 2,
        w: 10,
        h: Math.max(0, this.rect.h - 4),
      }),
      axis: "y",
      viewportSize: () => Math.max(0, this.rect.h),
      contentSize: () => this.contentH,
      value: () => this.scrollY,
      onChange: (next) => {
        this.scrollY = clamp(next, 0, this.maxScroll())
      },
      active: () => this.active,
    })
    this.scrollbar.z = 10
    this.add(this.viewport)
    this.add(this.scrollbar)
  }

  update(next: { rect: Rect; active: boolean; child: BuilderNode; createTreeSurface: (id: string) => BuilderTreeSurfaceLike; measureCtx?: CanvasRenderingContext2D }) {
    this.ensure(next.createTreeSurface)
    this.rect = next.rect
    this.active = next.active && next.rect.w > 0 && next.rect.h > 0
    this.contentSurface!.setNode(next.child)
    const viewportW = Math.max(0, next.rect.w - 14)
    const viewportH = next.rect.h
    const content = next.measureCtx
      ? this.contentSurface!.measureWithContext(next.measureCtx, { x: viewportW, y: viewportH })
      : this.contentSurface!.contentSize({ x: viewportW, y: viewportH })
    this.contentH = Math.max(next.rect.h, content.y)
    this.scrollY = clamp(this.scrollY, 0, this.maxScroll())
    this.scrollbar!.update({
      rect: () => ({
        x: this.rect.x + Math.max(0, this.rect.w - 12),
        y: this.rect.y + 2,
        w: 10,
        h: Math.max(0, this.rect.h - 4),
      }),
      axis: "y",
      viewportSize: () => Math.max(0, this.rect.h),
      contentSize: () => this.contentH,
      value: () => this.scrollY,
      onChange: (v) => {
        this.scrollY = clamp(v, 0, this.maxScroll())
      },
      active: () => this.active,
    })
  }

  unmount() {
    this.rect = ZERO_RECT
    this.active = false
    this.contentSurface?.setNode(null)
  }

  bounds() {
    if (!this.active) return ZERO_RECT
    return this.rect
  }
}

type ScrollAreaState = { widget: ScrollArea }

export const scrollAreaDescriptor: WidgetDescriptor<
  ScrollAreaState,
  { child: BuilderNode; createTreeSurface: (id: string) => BuilderTreeSurfaceLike; measureCtx?: CanvasRenderingContext2D }
> = {
  id: "scrollArea",
  initialZIndex: 5,
  create: (id) => ({ widget: new ScrollArea(id) }),
  getWidget: (state) => state.widget,
  mount: (state, props, rect, active) => {
    state.widget.update({ rect, active, child: props.child, createTreeSurface: props.createTreeSurface, measureCtx: props.measureCtx })
  },
  unmount: (state) => {
    state.widget.unmount()
  },
}
