import { theme } from "../theme"
import { draw, RectOp, ZERO_RECT, type Rect, type Vec2 } from "../draw"
import { AppError } from "../errors"
import { createLayoutContext, layout, measureLayout, type Rect as LayoutRect } from "../layout"
import type { DebugRuntimeStateSnapshot, DebugTreeNodeSnapshot, DrawRuntime } from "../ui_base"
import { RetainedRuntime } from "./runtime"
import { createDefaultBuilderRegistry, type RenderRegistry } from "./registry"
import { defaultNodeEnv, mergeNodeEnv } from "./styles"
import type { AstNode, BoxStyle, RenderElement, NodeEnv } from "./types"

export class RenderEngine {
  readonly runtime: RetainedRuntime
  readonly registry: RenderRegistry
  drawOps: Array<(ctx: CanvasRenderingContext2D) => void> = []
  private lastAst: AstNode | null = null

  constructor(registry: RenderRegistry = createDefaultBuilderRegistry(), createTreeSurface: (id: string) => any) {
    this.registry = registry
    this.runtime = new RetainedRuntime(createTreeSurface)
  }

  debugCounts() {
    return this.runtime.debugCounts()
  }

  hitTest(pSurface: Vec2) {
    return this.runtime.hitTest(pSurface)
  }

  clearDebugTree() {
    this.lastAst = null
  }

  debugRenderSnapshot(): DebugTreeNodeSnapshot | null {
    if (!this.lastAst) return null
    return astToDebugSnapshot(this.lastAst, this.registry)
  }

  debugRenderCounts() {
    if (!this.lastAst) return null
    return countAstRuntimeKinds(this.lastAst, this.registry)
  }

  toAst(node: RenderElement, ctx: CanvasRenderingContext2D, path: string, inheritedEnv: NodeEnv): AstNode {
    const handler = this.registry.get(node.kind)
    const nextInheritedEnv = mergeNodeEnv(inheritedEnv, node.provideEnv)
    const resolvedEnv = mergeNodeEnv(nextInheritedEnv, node.envOverride)
    const ast: AstNode = {
      id: nodeKey(node, path),
      builder: node,
      inheritedEnv: nextInheritedEnv,
      resolvedEnv,
      style: handler.getStyle?.(node as never) ?? node.style,
    }
    const children = handler.getChildren?.(node as never)
    if (children) {
      const parentAxis = node.kind === "column" ? "column" : node.kind === "stack" ? "stack" : node.style?.axis ?? "row"
      const hasListRow = children.some((c) => c.kind === "listRow" || c.kind === "rowItem")
      if (devGuardEnabled() && parentAxis === "row" && hasListRow) {
        throw new AppError({
          domain: "builder",
          code: "InvalidNodeNesting",
          message: "ListRow cannot be nested inside a row-axis container; use VStack/Column for lists or render ListRow directly.",
          details: { parent: node.kind, axis: parentAxis, child: "listRow", path },
        })
      }
      ast.children = children.filter(nodeVisible).map((child, index) => this.toAst(child, ctx, `${path}/${index}`, nextInheritedEnv))
    } else {
      ast.measure = (max) => handler.measure?.(this, ctx, node as never, max, path, ast) ?? { w: 0, h: 0 }
    }
    return ast
  }

  measureContentWithContext(ctx: CanvasRenderingContext2D, viewportSize: Vec2, node: RenderElement) {
    const ast = this.toAst(node, ctx, "root", defaultNodeEnv())
    const measured = measureLayout(ast, { w: viewportSize.x, h: Number.POSITIVE_INFINITY })
    return { x: Math.max(viewportSize.x, measured.w), y: Math.max(viewportSize.y, measured.h) }
  }

  render(ctx: CanvasRenderingContext2D, size: Vec2, node: RenderElement, rt?: DrawRuntime) {
    this.runtime.beginFrame()
    this.drawOps = []
    const ast = this.toAst(node, ctx, "root", defaultNodeEnv())
    const layoutContext = createLayoutContext()
    const measured = measureLayout(ast, { w: size.x, h: Number.POSITIVE_INFINITY }, layoutContext)
    const outer = { x: 0, y: 0, w: size.x, h: Math.max(size.y, measured.h) }
    layout(ast, outer, layoutContext)
    this.lastAst = ast
    this.mountAst(ctx, ast, "root")
    for (const op of this.drawOps) op(ctx)
    this.runtime.endFrame()
    this.runtime.root.draw(ctx, rt)
  }

  private mountAst(ctx: CanvasRenderingContext2D, ast: AstNode, path: string) {
    const node = ast.builder
    const rect = ast.rect ?? ZERO_RECT
    const active = nodeActive(node) && rect.w > 0 && rect.h > 0

    drawNodeBox(this.drawOps, rect, active, node.box)
    const handler = this.registry.get(node.kind)
    handler.mount?.(this, ctx, node as never, ast, path, active)
    for (let i = 0; i < (ast.children?.length ?? 0); i++) this.mountAst(ctx, ast.children![i], `${path}/${i}`)
  }
}

function nodeVisible(node: RenderElement) {
  return node.visible ?? true
}

function nodeActive(node: RenderElement) {
  return (node.active ?? true) && nodeVisible(node)
}

function nodeKey(node: RenderElement, path: string) {
  return node.key ?? path
}

function drawNodeBox(drawOps: Array<(ctx: CanvasRenderingContext2D) => void>, rect: Rect, active: boolean, box: BoxStyle | undefined) {
  if (!active || !box || (!box.fill && !box.stroke)) return
  const fill = box.fill
  const stroke = box.stroke
  const radius = box.radius ?? theme.radii.sm
  drawOps.push((canvas) => {
    draw(
      canvas,
      RectOp(
        { x: rect.x, y: rect.y, w: rect.w, h: rect.h },
        {
          radius,
                    fill: fill ? { paint: fill } : undefined,
          stroke: stroke ? { color: stroke, hairline: true } : undefined,
        },
      ),
    )
  })
}

export type RenderTreeSurfaceLike = {
  setNode(node: RenderElement | null): void
  setWheelFallback(fn: any): void
  contentSize(viewportSize: Vec2): Vec2
  measureWithContext(ctx: CanvasRenderingContext2D, viewportSize: Vec2): Vec2
}

function devGuardEnabled() {
  const v = (globalThis as any).__TNL_DEBUG_LEVEL__
  return v === "debug" || v === "trace"
}

function astToDebugSnapshot(ast: AstNode, registry: RenderRegistry): DebugTreeNodeSnapshot {
  const node = ast.builder
  const runtimeKind = registry.runtimeKind(node)
  const runtime: DebugRuntimeStateSnapshot = {
    title: "Render Element",
    fields: [
      { label: "kind", value: node.kind },
      { label: "runtime", value: runtimeKind },
      { label: "key", value: node.key ?? "-" },
      { label: "visible", value: String(node.visible ?? true) },
      { label: "active", value: String(node.active ?? true) },
    ],
  }
  return {
    kind: "element",
    type: "RenderElement",
    label: node.key ? `${node.kind}:${node.key}` : node.kind,
    id: ast.id,
    bounds: ast.rect,
    visible: node.visible ?? true,
    meta: runtimeKind,
    runtime,
    children: ((ast.children as AstNode[] | undefined) ?? []).map((child) => astToDebugSnapshot(child, registry)),
  }
}

function countAstRuntimeKinds(ast: AstNode, registry: RenderRegistry) {
  const counts = { total: 0, primitive: 0, control: 0, widget: 0 }
  const visit = (node: AstNode) => {
    counts.total += 1
    const runtimeKind = registry.runtimeKind(node.builder)
    counts[runtimeKind] += 1
    for (const child of (node.children as AstNode[] | undefined) ?? []) visit(child)
  }
  visit(ast)
  return counts
}
