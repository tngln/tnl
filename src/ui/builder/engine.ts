import { theme } from "../../config/theme"
import { draw, RectOp } from "../../core/draw"
import { AppError } from "../../core/errors"
import { layout, measureLayout, type Rect as LayoutRect } from "../../core/layout"
import { ZERO_RECT } from "../../core/rect"
import type { Rect, Vec2 } from "../base/ui"
import { BuilderRuntime } from "./runtime"
import { createDefaultBuilderRegistry, type BuilderNodeRegistry } from "./registry"
import { defaultInheritedStyle, mergeInheritedStyle } from "./styles"
import type { AstNode, BoxStyle, BuilderNode, InheritedStyle } from "./types"

export class BuilderEngine {
  readonly runtime: BuilderRuntime
  readonly registry: BuilderNodeRegistry
  drawOps: Array<(ctx: CanvasRenderingContext2D) => void> = []

  constructor(registry: BuilderNodeRegistry = createDefaultBuilderRegistry(), createTreeSurface: (id: string) => any) {
    this.registry = registry
    this.runtime = new BuilderRuntime(createTreeSurface)
  }

  debugCounts() {
    return this.runtime.debugCounts()
  }

  hitTest(pSurface: Vec2) {
    return this.runtime.hitTest(pSurface)
  }

  toAst(node: BuilderNode, ctx: CanvasRenderingContext2D, path: string, inherited: InheritedStyle): AstNode {
    const handler = this.registry.get(node.kind)
    const nextInherited = mergeInheritedStyle(inherited, node.provideStyle)
    const resolved = mergeInheritedStyle(nextInherited, node.styleOverride)
    const ast: AstNode = {
      id: nodeKey(node, path),
      builder: node,
      inherited: nextInherited,
      resolved,
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
      ast.children = children.filter(nodeVisible).map((child, index) => this.toAst(child, ctx, `${path}/${index}`, nextInherited))
    } else {
      ast.measure = (max) => handler.measure?.(this, ctx, node as never, max, path, ast) ?? { w: 0, h: 0 }
    }
    return ast
  }

  measureContentWithContext(ctx: CanvasRenderingContext2D, viewportSize: Vec2, node: BuilderNode) {
    const ast = this.toAst(node, ctx, "root", defaultInheritedStyle())
    const measured = measureLayout(ast, { w: viewportSize.x, h: Number.POSITIVE_INFINITY })
    return { x: Math.max(viewportSize.x, measured.w), y: Math.max(viewportSize.y, measured.h) }
  }

  render(ctx: CanvasRenderingContext2D, size: Vec2, node: BuilderNode) {
    this.runtime.beginFrame()
    this.drawOps = []
    const ast = this.toAst(node, ctx, "root", defaultInheritedStyle())
    const measured = measureLayout(ast, { w: size.x, h: Number.POSITIVE_INFINITY })
    const outer = { x: 0, y: 0, w: size.x, h: Math.max(size.y, measured.h) }
    layout(ast, outer)
    this.mountAst(ctx, ast, "root")
    for (const op of this.drawOps) op(ctx)
    this.runtime.endFrame()
    this.runtime.root.draw(ctx)
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

function nodeVisible(node: BuilderNode) {
  return node.visible ?? true
}

function nodeActive(node: BuilderNode) {
  return (node.active ?? true) && nodeVisible(node)
}

function nodeKey(node: BuilderNode, path: string) {
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
          fill: fill ? { color: fill } : undefined,
          stroke: stroke ? { color: stroke, hairline: true } : undefined,
          pixelSnap: true,
        },
      ),
    )
  })
}

export type BuilderTreeSurfaceLike = {
  setNode(node: BuilderNode | null): void
  setWheelFallback(fn: any): void
  contentSize(viewportSize: Vec2): Vec2
  measureWithContext(ctx: CanvasRenderingContext2D, viewportSize: Vec2): Vec2
}

function devGuardEnabled() {
  const v = (globalThis as any).__TNL_DEBUG_LEVEL__
  return v === "debug" || v === "trace"
}
