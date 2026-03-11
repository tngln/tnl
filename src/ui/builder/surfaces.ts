import { effect } from "../../core/reactivity"
import { invalidateAll } from "../invalidate"
import { createMeasureContext } from "../../platform/web/canvas"
import { SurfaceRoot, type Surface, type ViewportContext } from "../base/viewport"
import { WheelUIEvent, type DebugTreeNodeSnapshot, type Vec2 } from "../base/ui"
import { BuilderEngine } from "./engine"
import type { BuilderNode, MountedSurface, SurfaceDefinition, SurfaceMountSpec, SurfaceSetup } from "./types"

export class BuilderTreeSurface implements Surface {
  readonly id: string
  readonly engine: BuilderEngine
  private node: BuilderNode | null = null
  private wheelFallback: ((e: WheelUIEvent) => void) | null = null

  constructor(id: string) {
    this.id = id
    this.engine = new BuilderEngine(undefined, (nextId) => new BuilderTreeSurface(nextId))
  }

  setNode(node: BuilderNode | null) {
    this.node = node
  }

  setWheelFallback(fn: ((e: WheelUIEvent) => void) | null) {
    this.wheelFallback = fn
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
    this.engine.render(ctx as CanvasRenderingContext2D, { x: viewport.contentRect.w, y: viewport.contentRect.h }, this.node)
  }

  hitTest(pSurface: Vec2) {
    return this.engine.hitTest(pSurface)
  }

  onWheel(e: WheelUIEvent) {
    this.wheelFallback?.(e)
  }

  debugSnapshot(): DebugTreeNodeSnapshot {
    return {
      kind: "surface",
      type: "BuilderTreeSurface",
      label: this.id,
      id: this.id,
      visible: true,
      children: [this.engine.runtime.root.debugSnapshot()],
    }
  }
}

export class BuilderSurface implements Surface {
  readonly id: string
  private readonly tree: BuilderTreeSurface
  private readonly build: () => BuilderNode
  private readonly stopWatching: () => void

  constructor(opts: { id: string; build: () => BuilderNode }) {
    this.id = opts.id
    this.tree = new BuilderTreeSurface(opts.id)
    this.build = opts.build
    let ready = false
    this.stopWatching = effect(() => {
      this.build()
      if (!ready) {
        ready = true
        return
      }
      invalidateAll()
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

  onWheel(e: WheelUIEvent) {
    this.tree.onWheel?.(e)
  }

  debugCounts() {
    return this.tree.engine.debugCounts()
  }

  debugSnapshot() {
    return this.tree.debugSnapshot()
  }
}

export class FunctionalBuilderSurface<P> implements MountedSurface<P> {
  readonly id: string
  private readonly tree: BuilderTreeSurface
  private readonly renderNode: (props: P) => BuilderNode
  private props: P
  private readonly stopWatching: () => void

  constructor(opts: { id: string; props: P; setup: SurfaceSetup<P> }) {
    this.id = opts.id
    this.tree = new BuilderTreeSurface(opts.id)
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
      invalidateAll()
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

  onWheel(e: WheelUIEvent) {
    this.tree.onWheel?.(e)
  }

  debugCounts() {
    return this.tree.engine.debugCounts()
  }

  debugSnapshot() {
    return this.tree.debugSnapshot()
  }
}

export function defineSurface<P>(opts: {
  id: string | ((props: P) => string)
  setup: SurfaceSetup<P>
  displayName?: string
}): SurfaceDefinition<P> {
  return {
    kind: "surface-definition",
    displayName: opts.displayName ?? (typeof opts.id === "string" ? opts.id : "FunctionalBuilderSurface"),
    mount(props: P) {
      return new FunctionalBuilderSurface<P>({
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
