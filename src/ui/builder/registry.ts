import { theme } from "../../config/theme"
import { draw, RRect, Text } from "../../core/draw"
import { measureTextWidth } from "../../core/draw.text"
import { measureLayout, type LayoutStyle } from "../../core/layout"
import { ZERO_RECT } from "../../core/rect"
import { TREE_ROW_HEIGHT } from "../widgets"
import { textFont } from "./text"
import { inheritedTextToRichTextStyle, resolveTextColor, resolveTextEmphasis, resolveTextStyle } from "./styles"
import type { BuilderEngine } from "./engine"
import type { AstNode, BuilderNode, ButtonNode, CheckboxNode, ContainerNode, RadioNode, RichTextNode, RowNode, ScrollAreaNode, SpacerNode, TextNode, TreeViewNode } from "./types"
import { flattenTreeItems } from "./runtime"

export type MeasureSize = { w: number; h: number }

export type BuilderNodeHandler<TNode extends BuilderNode = BuilderNode> = {
  kind: TNode["kind"]
  getChildren?: (node: TNode) => BuilderNode[] | undefined
  getStyle?: (node: TNode) => LayoutStyle | undefined
  measure?: (engine: BuilderEngine, ctx: CanvasRenderingContext2D, node: TNode, max: MeasureSize, path: string, ast: AstNode) => MeasureSize
  mount?: (engine: BuilderEngine, ctx: CanvasRenderingContext2D, node: TNode, ast: AstNode, path: string, active: boolean) => void
}

export class BuilderNodeRegistry {
  private readonly handlers = new Map<BuilderNode["kind"], BuilderNodeHandler>()

  register<TNode extends BuilderNode>(handler: BuilderNodeHandler<TNode>) {
    this.handlers.set(handler.kind, handler as unknown as BuilderNodeHandler)
  }

  get(kind: BuilderNode["kind"]) {
    const handler = this.handlers.get(kind)
    if (!handler) throw new Error(`No builder node handler registered for ${kind}`)
    return handler
  }
}

function containerStyle(node: ContainerNode) {
  return { ...node.style, axis: node.kind }
}

const containerHandler: BuilderNodeHandler<ContainerNode> = {
  kind: "row",
  getChildren: (node) => node.children,
  getStyle: containerStyle,
}

const textHandler: BuilderNodeHandler<TextNode> = {
  kind: "text",
  measure: (_engine, ctx, node, max, _path, ast) => {
    const style = resolveTextStyle(ast.resolved, node)
    const f = textFont(style, resolveTextEmphasis(ast.resolved, node))
    return { w: Math.min(max.w, measureTextWidth(ctx, node.text, f)), h: style.lineHeight }
  },
  mount: (engine, _ctx, node, ast, _path, active) => {
    if (!active) return
    const rect = ast.rect ?? ZERO_RECT
    engine.drawOps.push((canvas) => {
      const style = resolveTextStyle(ast.resolved, node)
      draw(
        canvas,
        Text({
          x: rect.x,
          y: rect.y,
          text: node.text,
          style: {
            color: resolveTextColor(ast.resolved, node),
            font: textFont(style, resolveTextEmphasis(ast.resolved, node)),
            baseline: "top",
          },
        }),
      )
    })
  },
}

const richTextHandler: BuilderNodeHandler<RichTextNode> = {
  kind: "richText",
  measure: (engine, ctx, node, max, path, ast) => {
    const block = engine.runtime.ensureRichBlock(path, node.spans, node.textStyle ?? inheritedTextToRichTextStyle(ast.resolved.text), node.align)
    return block.measure(ctx, Math.max(0, max.w))
  },
  mount: (engine, _ctx, node, ast, path, active) => {
    if (!active) return
    const rect = ast.rect ?? ZERO_RECT
    engine.drawOps.push((canvas) => {
      const block = engine.runtime.ensureRichBlock(path, node.spans, node.textStyle ?? inheritedTextToRichTextStyle(ast.resolved.text), node.align)
      block.measure(canvas, rect.w)
      block.draw(canvas, { x: rect.x, y: rect.y })
    })
  },
}

const buttonHandler: BuilderNodeHandler<ButtonNode> = {
  kind: "button",
  measure: (_engine, ctx, node, max) => {
    const w = measureTextWidth(ctx, node.text, textFont({
      fontFamily: theme.typography.family,
      fontSize: theme.typography.body.size,
      fontWeight: theme.typography.body.weight,
      lineHeight: theme.spacing.lg,
    }))
    return { w: Math.min(max.w, w + 28), h: 32 }
  },
  mount: (engine, _ctx, node, ast, path, active) => {
    engine.runtime.mountButton(path, ast.rect ?? ZERO_RECT, node, active)
  },
}

const checkboxHandler: BuilderNodeHandler<CheckboxNode> = {
  kind: "checkbox",
  measure: (_engine, ctx, node, max) => {
    const w = measureTextWidth(ctx, node.label, textFont({
      fontFamily: theme.typography.family,
      fontSize: theme.typography.body.size,
      fontWeight: theme.typography.body.weight,
      lineHeight: theme.spacing.lg,
    }))
    return { w: Math.min(max.w, w + 28), h: 24 }
  },
  mount: (engine, _ctx, node, ast, path, active) => {
    engine.runtime.mountCheckbox(path, ast.rect ?? ZERO_RECT, node, active)
  },
}

const radioHandler: BuilderNodeHandler<RadioNode> = {
  kind: "radio",
  measure: (_engine, ctx, node, max) => {
    const w = measureTextWidth(ctx, node.label, textFont({
      fontFamily: theme.typography.family,
      fontSize: theme.typography.body.size,
      fontWeight: theme.typography.body.weight,
      lineHeight: theme.spacing.lg,
    }))
    return { w: Math.min(max.w, w + 28), h: 24 }
  },
  mount: (engine, _ctx, node, ast, path, active) => {
    engine.runtime.mountRadio(path, ast.rect ?? ZERO_RECT, node, active)
  },
}

const rowItemHandler: BuilderNodeHandler<RowNode> = {
  kind: "rowItem",
  measure: () => ({ w: Number.POSITIVE_INFINITY, h: 22 }),
  mount: (engine, _ctx, node, ast, path, active) => {
    engine.runtime.mountRow(path, ast.rect ?? ZERO_RECT, node, active)
  },
}

const treeViewHandler: BuilderNodeHandler<TreeViewNode> = {
  kind: "treeView",
  measure: (_engine, _ctx, node, max) => {
    const rows = flattenTreeItems(node.items, node.expanded)
    return { w: max.w, h: rows.length * TREE_ROW_HEIGHT }
  },
  mount: (engine, _ctx, node, ast, path, active) => {
    engine.runtime.mountTreeView(path, ast.rect ?? ZERO_RECT, node, active)
  },
}

const scrollAreaHandler: BuilderNodeHandler<ScrollAreaNode> = {
  kind: "scrollArea",
  measure: (engine, ctx, node, max, path, ast) => {
    const childAst = engine.toAst(node.child, ctx, `${path}/content`, ast.inherited)
    const child = measureLayout(childAst, { w: max.w, h: Number.POSITIVE_INFINITY })
    return { w: Math.min(max.w, child.w), h: Math.min(max.h, child.h) }
  },
  mount: (engine, ctx, node, ast, path, active) => {
    engine.runtime.mountScrollArea(path, ast.rect ?? ZERO_RECT, node, active, ctx)
  },
}

const spacerHandler: BuilderNodeHandler<SpacerNode> = {
  kind: "spacer",
  measure: () => ({ w: 0, h: 0 }),
}

export function createDefaultBuilderRegistry() {
  const registry = new BuilderNodeRegistry()
  registry.register(containerHandler)
  registry.register({ ...containerHandler, kind: "column" })
  registry.register({ ...containerHandler, kind: "stack" })
  registry.register(textHandler)
  registry.register(richTextHandler)
  registry.register(buttonHandler)
  registry.register(checkboxHandler)
  registry.register(radioHandler)
  registry.register(rowItemHandler)
  registry.register(treeViewHandler)
  registry.register(scrollAreaHandler)
  registry.register(spacerHandler)
  return registry
}
