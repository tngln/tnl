import { effect } from "../reactivity"
import { invalidateAll } from "../invalidate"
import { createMeasureContext } from "../platform/web/canvas"
import { SurfaceRoot, type Surface, type ViewportContext } from "../ui/viewport"
import { WheelUIEvent, type DebugTreeNodeSnapshot, type Vec2 } from "../ui/ui_base"
import { RenderEngine } from "./engine"
import type { RenderElement, MountedSurface, SurfaceDefinition, SurfaceMountSpec, SurfaceSetup } from "./types"

export class RenderTreeSurface implements Surface {
  readonly id: string
  readonly engine: RenderEngine
  private node: RenderElement | null = null
  private wheelFallback: ((e: WheelUIEvent) => void) | null = null
  private invalidateSurface: () => void = invalidateAll

  constructor(id: string) {
    this.id = id
    this.engine = new RenderEngine(undefined, (nextId) => new RenderTreeSurface(nextId))
  }

  setNode(node: RenderElement | null) {
    this.node = node
    if (!node) this.engine.clearDebugTree()
  }

  setWheelFallback(fn: ((e: WheelUIEvent) => void) | null) {
    this.wheelFallback = fn
  }

  setInvalidator(fn: (() => void) | null) {
    this.invalidateSurface = fn ?? invalidateAll
    this.engine.runtime.setInvalidator(fn)
  }

  invalidate() {
    this.invalidateSurface()
  }

  contentSize(viewportSize: Vec2) {
    if (!this.node) return viewportSize
    const ctx = createMeasureContext()
    if (!ctx) return viewportSize
    return this.engine.measureContentWithContext(ctx as CanvasRenderingContext2D, viewportSize, this.node)
  }

  measureWithContext(ctx: CanvasRenderingContext2D, viewportSize: Vec2) {
    if (!this.node) return viewportSize
    return this.engine.measureContentWithContext(ctx, viewportSize, this.node)
  }

  render(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, viewport: ViewportContext) {
    if (!this.node) return
    this.engine.render(
      ctx as CanvasRenderingContext2D,
      { x: viewport.contentRect.w, y: viewport.contentRect.h },
      this.node,
      {
        frameId: 0,
        dpr: viewport.dpr,
        invalidateRect: () => this.invalidateSurface(),
      },
    )
  }

  hitTest(pSurface: Vec2) {
    return this.engine.hitTest(pSurface)
  }

  lightDismiss(pSurface: Vec2) {
    this.engine.runtime.topLayer.lightDismiss(pSurface)
  }

  onWheel(e: WheelUIEvent) {
    this.wheelFallback?.(e)
  }

  debugSnapshot(): DebugTreeNodeSnapshot {
    const renderTree = this.engine.debugRenderSnapshot()
    const renderCounts = this.engine.debugRenderCounts()
    const runtimeCounts = this.engine.debugCounts()
    return {
      kind: "surface",
      type: "RenderTreeSurface",
      label: this.id,
      id: this.id,
      visible: true,
      children: [
        ...(renderTree
          ? [{
              kind: "element" as const,
              type: "RenderTree",
              label: "Render Tree",
              meta: renderCounts ? `p${renderCounts.primitive} c${renderCounts.control} w${renderCounts.widget}` : (renderTree.meta ?? "primitive"),
              runtime: {
                title: "Render Snapshot",
                fields: [
                  { label: "total", value: String(renderCounts?.total ?? 0) },
                  { label: "primitive", value: String(renderCounts?.primitive ?? 0) },
                  { label: "control", value: String(renderCounts?.control ?? 0) },
                  { label: "widget", value: String(renderCounts?.widget ?? 0) },
                  { label: "retained", value: String(runtimeCounts.retained) },
                  { label: "controls", value: String(runtimeCounts.controls) },
                  { label: "widgets", value: String(runtimeCounts.statefulWidgets) },
                ],
              },
              children: [renderTree],
            }]
          : []),
        {
          kind: "element" as const,
          type: "RetainedTree",
          label: "Retained Runtime",
          meta: `${runtimeCounts.retained} retained`,
          children: [this.engine.runtime.root.debugSnapshot()],
        },
      ],
    }
  }
}

export class RenderSurface implements Surface {
  readonly id: string
  private readonly tree: RenderTreeSurface
  private readonly build: () => RenderElement
  private readonly stopWatching: () => void

  constructor(opts: { id: string; build: () => RenderElement }) {
    this.id = opts.id
    this.tree = new RenderTreeSurface(opts.id)
    this.build = opts.build
    let ready = false
    this.stopWatching = effect(() => {
      this.build()
      if (!ready) {
        ready = true
        return
      }
      this.tree.invalidate()
    })
  }

  contentSize(viewportSize: Vec2) {
    const node = this.build()
    this.tree.setNode(node)
    return this.tree.contentSize(viewportSize)
  }

  render(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, viewport: ViewportContext) {
    this.tree.setNode(this.build())
    this.tree.render(ctx, viewport)
  }

  hitTest(pSurface: Vec2) {
    return this.tree.hitTest(pSurface)
  }

  lightDismiss(pSurface: Vec2) {
    this.tree.lightDismiss(pSurface)
  }

  onWheel(e: WheelUIEvent) {
    this.tree.onWheel?.(e)
  }

  debugCounts() {
    return this.tree.engine.debugCounts()
  }

  debugSnapshot() {
    return this.tree.debugSnapshot()
  }

  setInvalidator(fn: (() => void) | null) {
    this.tree.setInvalidator(fn)
  }
}

export class FunctionalSurface<P> implements MountedSurface<P> {
  readonly id: string
  private readonly tree: RenderTreeSurface
  private readonly renderNode: (props: P) => RenderElement
  private props: P
  private readonly stopWatching: () => void

  constructor(opts: { id: string; props: P; setup: SurfaceSetup<P> }) {
    this.id = opts.id
    this.tree = new RenderTreeSurface(opts.id)
    this.props = opts.props
    const result = opts.setup(opts.props)
    this.renderNode = typeof result === "function" ? result : result.render
    let ready = false
    this.stopWatching = effect(() => {
      this.buildNode()
      if (!ready) {
        ready = true
        return
      }
      this.tree.invalidate()
    })
  }

  setProps(props: P) {
    this.props = props
  }

  private buildNode() {
    return this.renderNode(this.props)
  }

  contentSize(viewportSize: Vec2) {
    const node = this.buildNode()
    this.tree.setNode(node)
    return this.tree.contentSize(viewportSize)
  }

  render(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, viewport: ViewportContext) {
    this.tree.setNode(this.buildNode())
    this.tree.render(ctx, viewport)
  }

  hitTest(pSurface: Vec2) {
    return this.tree.hitTest(pSurface)
  }

  lightDismiss(pSurface: Vec2) {
    this.tree.lightDismiss(pSurface)
  }

  onWheel(e: WheelUIEvent) {
    this.tree.onWheel?.(e)
  }

  debugCounts() {
    return this.tree.engine.debugCounts()
  }

  debugSnapshot() {
    return this.tree.debugSnapshot()
  }

  setInvalidator(fn: (() => void) | null) {
    this.tree.setInvalidator(fn)
  }
}

export function defineSurface<P>(opts: {
  id: string | ((props: P) => string)
  setup: SurfaceSetup<P>
  displayName?: string
}): SurfaceDefinition<P> {
  return {
    kind: "surface-definition",
    displayName: opts.displayName ?? (typeof opts.id === "string" ? opts.id : "FunctionalSurface"),
    mount(props: P) {
      return new FunctionalSurface<P>({
        id: typeof opts.id === "function" ? opts.id(props) : opts.id,
        props,
        setup: opts.setup,
      })
    },
  }
}

export function mountSurface<P>(definition: SurfaceDefinition<P>, props: P) {
  return definition.mount(props)
}

export function surfaceMount<P>(definition: SurfaceDefinition<P>, props: P): SurfaceMountSpec<P> {
  return { kind: "surface-mount", definition, props }
}

export function isSurfaceMountSpec(value: unknown): value is SurfaceMountSpec<unknown> {
  return typeof value === "object" && value !== null && (value as SurfaceMountSpec<unknown>).kind === "surface-mount"
}
