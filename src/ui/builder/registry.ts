import { theme } from "@/config/theme"
import { draw, RRect, Text } from "@/core/draw"
import { measureTextWidth } from "@/core/draw.text"
import { AppError } from "@/core/errors"
import { measureLayout, type LayoutStyle } from "@/core/layout"
import { ZERO_RECT } from "@/core/rect"
import { TREE_ROW_HEIGHT, buttonDescriptor, checkboxDescriptor, clickAreaDescriptor, dropdownDescriptor, listRowDescriptor, radioDescriptor, richTextSelectableDescriptor, scrollAreaDescriptor, scrollbarDescriptor, sliderDescriptor, textBoxDescriptor, treeRowDescriptor } from "@/ui/widgets"
import { textFont } from "./text"
import { inheritedTextToRichTextStyle, resolveTextColor, resolveTextEmphasis, resolveTextStyle } from "./styles"
import type { BuilderEngine } from "./engine"
import type { AstNode, BuilderNode, ButtonNode, CheckboxNode, ClickAreaNode, ContainerNode, DropdownNode, PaintNode, RadioNode, RichTextNode, RowNode, ScrollAreaNode, SliderNode, SpacerNode, TextBoxNode, TextNode, TreeViewNode } from "./types"
import { flattenTreeItems } from "./runtime"
import { widgetRegistry } from "./widget_registry"

widgetRegistry.register(buttonDescriptor)
widgetRegistry.register(clickAreaDescriptor)
widgetRegistry.register(checkboxDescriptor)
widgetRegistry.register(dropdownDescriptor)
widgetRegistry.register(listRowDescriptor)
widgetRegistry.register(radioDescriptor)
widgetRegistry.register(richTextSelectableDescriptor)
widgetRegistry.register(scrollAreaDescriptor)
widgetRegistry.register(scrollbarDescriptor)
widgetRegistry.register(sliderDescriptor)
widgetRegistry.register(textBoxDescriptor)
widgetRegistry.register(treeRowDescriptor)

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
    if (!handler) {
      throw new AppError({
        domain: "builder",
        code: "MissingNodeHandler",
        message: `No builder node handler registered for ${kind}`,
        details: { kind },
      })
    }
    return handler
  }
}

function containerStyle(node: ContainerNode) {
  if (node.kind === "stack") return { ...node.style, axis: "stack" as LayoutStyle["axis"] }
  const axis: LayoutStyle["axis"] = node.style?.axis ?? (node.kind === "column" ? "column" : "row")
  return { ...node.style, axis }
}

const containerHandler: BuilderNodeHandler<ContainerNode> = {
  kind: "flex",
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
    const rect = ast.rect ?? ZERO_RECT
    if (node.selectable) {
      const block = engine.runtime.ensureRichBlock(path, node.spans, node.textStyle ?? inheritedTextToRichTextStyle(ast.resolved.text), node.align)
      engine.runtime.mountWidget("richTextSelectable", path, rect, { block, topLayer: engine.runtime.topLayer }, active)
      return
    }
    if (!active) return
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
    return { w: Math.min(max.w, w + 28), h: theme.ui.controls.buttonHeight }
  },
  mount: (engine, _ctx, node, ast, path, active) => {
    engine.runtime.mountWidget("button", path, ast.rect ?? ZERO_RECT, node, active)
  },
}

const clickAreaHandler: BuilderNodeHandler<ClickAreaNode> = {
  kind: "clickArea",
  measure: () => ({ w: 0, h: 0 }),
  mount: (engine, _ctx, node, ast, path, active) => {
    engine.runtime.mountWidget("clickArea", path, ast.rect ?? ZERO_RECT, node, active)
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
    return { w: Math.min(max.w, w + 28), h: theme.ui.controls.choiceHeight }
  },
  mount: (engine, _ctx, node, ast, path, active) => {
    engine.runtime.mountWidget("checkbox", path, ast.rect ?? ZERO_RECT, node, active)
  },
}

const dropdownHandler: BuilderNodeHandler<DropdownNode> = {
  kind: "dropdown",
  measure: (_engine, ctx, node, max) => {
    const f = textFont({
      fontFamily: theme.typography.family,
      fontSize: theme.typography.body.size,
      fontWeight: theme.typography.body.weight,
      lineHeight: theme.spacing.lg,
    })
    let w = 0
    for (const opt of node.options) w = Math.max(w, measureTextWidth(ctx, opt.label, f))
    return { w: Math.min(max.w, Math.max(theme.ui.controls.minFieldWidth, w + 28)), h: theme.ui.controls.inputHeight }
  },
  mount: (engine, _ctx, node, ast, path, active) => {
    engine.runtime.mountWidget(
      "dropdown",
      path,
      ast.rect ?? ZERO_RECT,
      { options: node.options, selected: node.selected, disabled: node.disabled, topLayer: engine.runtime.topLayer },
      active,
    )
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
    return { w: Math.min(max.w, w + 28), h: theme.ui.controls.choiceHeight }
  },
  mount: (engine, _ctx, node, ast, path, active) => {
    engine.runtime.mountWidget("radio", path, ast.rect ?? ZERO_RECT, node, active)
  },
}

const textBoxHandler: BuilderNodeHandler<TextBoxNode> = {
  kind: "textbox",
  measure: (_engine, ctx, node, max) => {
    const basis = node.placeholder && !node.value.peek() ? node.placeholder : node.value.peek()
    const w = measureTextWidth(ctx, basis || " ", textFont({
      fontFamily: theme.typography.family,
      fontSize: theme.typography.body.size,
      fontWeight: theme.typography.body.weight,
      lineHeight: theme.spacing.lg,
    }))
    return { w: Math.min(max.w, Math.max(theme.ui.controls.minFieldWidth, w + 16)), h: theme.ui.controls.inputHeight }
  },
  mount: (engine, _ctx, node, ast, path, active) => {
    engine.runtime.mountWidget("textbox", path, ast.rect ?? ZERO_RECT, node, active)
  },
}

const rowItemHandler: BuilderNodeHandler<RowNode> = {
  kind: "listRow",
  measure: (_engine, _ctx, _node, max) => ({ w: max.w, h: theme.ui.controls.rowHeight }),
  mount: (engine, _ctx, node, ast, path, active) => {
    engine.runtime.mountWidget("listRow", path, ast.rect ?? ZERO_RECT, node, active)
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
    return { w: max.w, h: Math.min(max.h, child.h) }
  },
  mount: (engine, ctx, node, ast, path, active) => {
    engine.runtime.mountWidget(
      "scrollArea",
      path,
      ast.rect ?? ZERO_RECT,
      { child: node.child, createTreeSurface: engine.runtime.treeSurfaceFactory(), measureCtx: ctx },
      active,
    )
  },
}

const paintHandler: BuilderNodeHandler<PaintNode> = {
  kind: "paint",
  measure: (_engine, _ctx, node, max) => node.measure?.(max) ?? { w: max.w, h: 0 },
  mount: (engine, _ctx, node, ast, _path, active) => {
    const rect = ast.rect ?? ZERO_RECT
    engine.drawOps.push((canvas) => {
      node.draw(canvas, rect, active)
    })
  },
}

const sliderHandler: BuilderNodeHandler<SliderNode> = {
  kind: "slider",
  measure: (_engine, _ctx, _node, max) => ({ w: max.w, h: 20 }),
  mount: (engine, _ctx, node, ast, path, active) => {
    engine.runtime.mountWidget("slider", path, ast.rect ?? ZERO_RECT, node, active)
  },
}

const spacerHandler: BuilderNodeHandler<SpacerNode> = {
  kind: "spacer",
  measure: () => ({ w: 0, h: 0 }),
}

export function createDefaultBuilderRegistry() {
  const registry = new BuilderNodeRegistry()
  registry.register(containerHandler)
  registry.register({ ...containerHandler, kind: "row" })
  registry.register({ ...containerHandler, kind: "column" })
  registry.register({ ...containerHandler, kind: "stack" })
  registry.register(textHandler)
  registry.register(richTextHandler)
  registry.register(buttonHandler)
  registry.register(clickAreaHandler)
  registry.register(checkboxHandler)
  registry.register(dropdownHandler)
  registry.register(radioHandler)
  registry.register(textBoxHandler)
  registry.register(rowItemHandler)
  registry.register({ ...rowItemHandler, kind: "rowItem" })
  registry.register(treeViewHandler)
  registry.register(scrollAreaHandler)
  registry.register(paintHandler)
  registry.register(sliderHandler)
  registry.register(spacerHandler)
  return registry
}
