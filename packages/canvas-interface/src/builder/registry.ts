import { theme } from "../theme"
import { draw, TextOp, measureTextWidth, truncateToWidth, ZERO_RECT } from "../draw"
import { AppError } from "../errors"
import { measureLayout, type LayoutStyle } from "../layout"
import { dropdownDescriptor } from "../widgets/dropdown"
import { richTextSelectableDescriptor } from "../widgets/rich_text_selectable"
import { scrollAreaDescriptor } from "../widgets/scroll_area"
import { scrollbarDescriptor } from "../widgets/scrollbar"
import { textBoxDescriptor } from "../widgets/textbox"
import { TREE_ROW_HEIGHT, treeRowDescriptor } from "../widgets/tree_row"
import { fontString } from "../text"
import { buildButtonVisual, buildCheckboxVisual, buildListRowVisual, buildRadioVisual, drawButton, drawCheckbox, drawListRow, drawRadio } from "./draw_controls"
import { drawSlider, resolveSliderValueFromPointer } from "./slider_control"
import { resolveTextColor, resolveTextEmphasis, resolveTextStyle, textEnvToRichTextStyle } from "./styles"
import type { RenderEngine } from "./engine"
import type { ControlMountOpts } from "./runtime"
import type { AstNode, RenderElement, RetainedKind, ButtonNode, CheckboxNode, ClickAreaNode, ContainerNode, DropdownNode, LabelNode, PaintNode, RadioNode, RichTextNode, RowNode, ScrollAreaNode, SliderNode, TextBoxNode, TextOverflow, TreeViewNode } from "./types"
import { flattenTreeItems } from "./runtime"
import { measureVisualNode } from "./visual"
import { resolveDropdownVisualModel } from "./widget_visuals"
import { widgetRegistry } from "./widget_registry"

widgetRegistry.register(dropdownDescriptor)
widgetRegistry.register(richTextSelectableDescriptor)
widgetRegistry.register(scrollAreaDescriptor)
widgetRegistry.register(scrollbarDescriptor)
widgetRegistry.register(textBoxDescriptor)
widgetRegistry.register(treeRowDescriptor)

export type MeasureSize = { w: number; h: number }

type RuntimeKindResolver<TNode extends RenderElement> = RetainedKind | ((node: TNode) => RetainedKind)

export type RenderHandler<TNode extends RenderElement = RenderElement> = {
  kind: TNode["kind"]
  runtimeKind: RuntimeKindResolver<TNode>
  getChildren?: (node: TNode) => RenderElement[] | undefined
  getStyle?: (node: TNode) => LayoutStyle | undefined
  measure?: (engine: RenderEngine, ctx: CanvasRenderingContext2D, node: TNode, max: MeasureSize, path: string, ast: AstNode) => MeasureSize
  mount?: (engine: RenderEngine, ctx: CanvasRenderingContext2D, node: TNode, ast: AstNode, path: string, active: boolean) => void
}

export class RenderRegistry {
  private readonly handlers = new Map<RenderElement["kind"], RenderHandler>()

  register<TNode extends RenderElement>(handler: RenderHandler<TNode>) {
    this.handlers.set(handler.kind, handler as unknown as RenderHandler)
  }

  get(kind: RenderElement["kind"]) {
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

  runtimeKind(node: RenderElement): RetainedKind {
    return resolveElementRetainedKind(this.get(node.kind) as RenderHandler<typeof node>, node)
  }
}

export function resolveElementRetainedKind<TNode extends RenderElement>(handler: RenderHandler<TNode>, node: TNode): RetainedKind {
  return typeof handler.runtimeKind === "function" ? handler.runtimeKind(node) : handler.runtimeKind
}

type BaseHandlerOpts<TNode extends RenderElement> = {
  kind: TNode["kind"]
  getChildren?: (node: TNode) => RenderElement[] | undefined
  getStyle?: (node: TNode) => LayoutStyle | undefined
  measure?: (engine: RenderEngine, ctx: CanvasRenderingContext2D, node: TNode, max: MeasureSize, path: string, ast: AstNode) => MeasureSize
}

type PrimitiveHandlerOpts<TNode extends RenderElement> = BaseHandlerOpts<TNode> & {
  runtimeKind?: RuntimeKindResolver<TNode>
  mount?: (engine: RenderEngine, ctx: CanvasRenderingContext2D, node: TNode, ast: AstNode, path: string, active: boolean) => void
}

type ControlHandlerOpts<TNode extends RenderElement> = BaseHandlerOpts<TNode> & {
  mountControl: (engine: RenderEngine, ctx: CanvasRenderingContext2D, node: TNode, ast: AstNode, path: string, active: boolean) => ControlMountOpts
}

type WidgetHandlerOpts<TNode extends RenderElement, TProps> = BaseHandlerOpts<TNode> & {
  widgetType: string
  mountWidget: (engine: RenderEngine, ctx: CanvasRenderingContext2D, node: TNode, ast: AstNode, path: string, active: boolean) => TProps
}

function primitiveHandler<TNode extends RenderElement>(opts: PrimitiveHandlerOpts<TNode>): RenderHandler<TNode> {
  return {
    ...opts,
    runtimeKind: opts.runtimeKind ?? "primitive",
  }
}

function controlHandler<TNode extends RenderElement>(opts: ControlHandlerOpts<TNode>): RenderHandler<TNode> {
  return {
    ...opts,
    runtimeKind: "control",
    mount: (engine, ctx, node, ast, path, active) => {
      engine.runtime.mountControl(path, ast.rect ?? ZERO_RECT, active, opts.mountControl(engine, ctx, node, ast, path, active))
    },
  }
}

function widgetHandler<TNode extends RenderElement, TProps>(opts: WidgetHandlerOpts<TNode, TProps>): RenderHandler<TNode> {
  return {
    ...opts,
    runtimeKind: "widget",
    mount: (engine, ctx, node, ast, path, active) => {
      engine.runtime.mountWidget(opts.widgetType, path, ast.rect ?? ZERO_RECT, opts.mountWidget(engine, ctx, node, ast, path, active), active)
    },
  }
}

function containerStyle(node: ContainerNode) {
  if (node.kind === "stack") return { ...node.style, axis: "stack" as LayoutStyle["axis"] }
  const axis: LayoutStyle["axis"] = node.style?.axis ?? (node.kind === "column" ? "column" : "row")
  return { ...node.style, axis }
}

const containerHandler = primitiveHandler<ContainerNode>({
  kind: "flex",
  getChildren: (node) => node.children,
  getStyle: containerStyle,
})

type PlainTextNode = Extract<RenderElement, { kind: "text" }> | LabelNode

function measurePlainTextNode(ctx: CanvasRenderingContext2D, node: PlainTextNode, max: MeasureSize, ast: AstNode, overflow: TextOverflow) {
  const style = resolveTextStyle(ast.resolvedEnv, node)
  const font = fontString(style, resolveTextEmphasis(ast.resolvedEnv, node))
  const width = measureTextWidth(ctx, node.text, font)
  return {
    w: overflow === "visible" ? width : Math.min(max.w, width),
    h: style.lineHeight,
  }
}

function mountPlainTextNode(engine: RenderEngine, node: PlainTextNode, ast: AstNode, active: boolean, overflow: TextOverflow) {
  if (!active) return
  const rect = ast.rect ?? ZERO_RECT
  engine.drawOps.push((canvas) => {
    const style = resolveTextStyle(ast.resolvedEnv, node)
    const font = fontString(style, resolveTextEmphasis(ast.resolvedEnv, node))
    let text = node.text
    if (overflow === "truncate") {
      canvas.save()
      canvas.font = font
      text = truncateToWidth(canvas, text, rect.w)
      canvas.restore()
    }
    const op = TextOp({
      x: rect.x,
      y: rect.y,
      text,
      style: {
        color: resolveTextColor(ast.resolvedEnv, node),
        font,
        baseline: "top",
      },
    })
    if (overflow === "clip") {
      canvas.save()
      canvas.beginPath()
      canvas.rect(rect.x, rect.y, rect.w, rect.h)
      canvas.clip()
      draw(canvas, op)
      canvas.restore()
      return
    }
    draw(canvas, op)
  })
}

const textHandler = primitiveHandler<Extract<RenderElement, { kind: "text" }>>({
  kind: "text",
  measure: (_engine, ctx, node, max, _path, ast) => {
    return measurePlainTextNode(ctx, node, max, ast, "visible")
  },
  mount: (engine, _ctx, node, ast, _path, active) => {
    mountPlainTextNode(engine, node, ast, active, "visible")
  },
})

const labelHandler = primitiveHandler<LabelNode>({
  kind: "label",
  measure: (_engine, ctx, node, max, _path, ast) => measurePlainTextNode(ctx, node, max, ast, node.overflow ?? "truncate"),
  mount: (engine, _ctx, node, ast, _path, active) => {
    mountPlainTextNode(engine, node, ast, active, node.overflow ?? "truncate")
  },
})

const richTextHandler = primitiveHandler<RichTextNode>({
  kind: "richText",
  runtimeKind: (node) => (node.selectable ? "widget" : "primitive"),
  measure: (engine, ctx, node, max, path, ast) => {
    const block = engine.runtime.ensureRichBlock(path, node.spans, node.textStyle ?? textEnvToRichTextStyle(ast.resolvedEnv.text), node.align)
    return block.measure(ctx, Math.max(0, max.w))
  },
  mount: (engine, _ctx, node, ast, path, active) => {
    const rect = ast.rect ?? ZERO_RECT
    if (node.selectable) {
      const block = engine.runtime.ensureRichBlock(path, node.spans, node.textStyle ?? textEnvToRichTextStyle(ast.resolvedEnv.text), node.align)
      engine.runtime.mountWidget("richTextSelectable", path, rect, { block, topLayer: engine.runtime.topLayer }, active)
      return
    }
    if (!active) return
    engine.drawOps.push((canvas) => {
      const block = engine.runtime.ensureRichBlock(path, node.spans, node.textStyle ?? textEnvToRichTextStyle(ast.resolvedEnv.text), node.align)
      block.measure(canvas, rect.w)
      block.draw(canvas, { x: rect.x, y: rect.y })
    })
  },
})

const buttonHandler = controlHandler<ButtonNode>({
  kind: "button",
  measure: (_engine, ctx, node, max) =>
    measureVisualNode(ctx, buildButtonVisual({ text: node.text, title: node.title, visualStyle: node.visualStyle, leadingIcon: node.leadingIcon, trailingIcon: node.trailingIcon }, { hover: false, pressed: false, dragging: false, disabled: !!node.disabled }, !!node.disabled), max, {
      state: { hover: false, pressed: false, dragging: false, disabled: !!node.disabled },
      disabled: node.disabled,
    }),
  mountControl: (_engine, _ctx, node) => ({
      disabled: node.disabled ?? false,
      draw: (ctx, r, state) => drawButton(ctx, r, { text: node.text, title: node.title, visualStyle: node.visualStyle, leadingIcon: node.leadingIcon, trailingIcon: node.trailingIcon }, state, node.disabled ?? false),
      onClick: node.onClick,
    }),
})

const clickAreaHandler = controlHandler<ClickAreaNode>({
  kind: "clickArea",
  measure: () => ({ w: 0, h: 0 }),
  mountControl: (_engine, _ctx, node) => ({
      disabled: node.disabled ?? false,
      draw: () => {},
      onClick: node.onClick,
    }),
})

const checkboxHandler = controlHandler<CheckboxNode>({
  kind: "checkbox",
  measure: (_engine, ctx, node, max) =>
    measureVisualNode(ctx, buildCheckboxVisual({ label: node.label, checked: node.checked.peek(), visualStyle: node.visualStyle }, {
      state: { hover: false, pressed: false, dragging: false, disabled: !!node.disabled },
      disabled: node.disabled,
      checked: node.checked.peek(),
    }), max, {
      state: { hover: false, pressed: false, dragging: false, disabled: !!node.disabled },
      disabled: node.disabled,
      checked: node.checked.peek(),
    }),
  mountControl: (_engine, _ctx, node) => ({
      disabled: node.disabled ?? false,
      draw: (ctx, r, state) => drawCheckbox(ctx, r, { label: node.label, checked: node.checked.peek(), visualStyle: node.visualStyle }, state, node.disabled ?? false),
      onClick: () => node.checked.set((v) => !v),
    }),
})

const dropdownHandler = widgetHandler<DropdownNode, Parameters<typeof dropdownDescriptor.mount>[1]>({
  kind: "dropdown",
  widgetType: "dropdown",
  measure: (_engine, ctx, node, max) => {
    const f = fontString({
      fontFamily: theme.typography.family,
      fontSize: theme.typography.body.size,
      fontWeight: theme.typography.body.weight,
      lineHeight: theme.spacing.lg,
    })
    let w = 0
    for (const opt of node.options) w = Math.max(w, measureTextWidth(ctx, opt.label, f))
    return { w: Math.min(max.w, Math.max(theme.ui.controls.minFieldWidth, w + 28)), h: theme.ui.controls.inputHeight }
  },
  mountWidget: (engine, _ctx, node, _ast, path) => ({
    behavior: { options: node.options, selected: node.selected, topLayer: engine.runtime.topLayer },
    visual: resolveDropdownVisualModel({ options: node.options, selectedValue: node.selected.peek(), visualStyle: node.visualStyle }),
    disabled: node.disabled,
    runtimeState: { key: path, store: engine.runtime.nodeStateStore },
  }),
})

const radioHandler = controlHandler<RadioNode>({
  kind: "radio",
  measure: (_engine, ctx, node, max) =>
    measureVisualNode(ctx, buildRadioVisual({ label: node.label, value: node.value, selected: node.selected.peek(), visualStyle: node.visualStyle }, {
      state: { hover: false, pressed: false, dragging: false, disabled: !!node.disabled },
      disabled: node.disabled,
      checked: node.selected.peek() === node.value,
    }), max, {
      state: { hover: false, pressed: false, dragging: false, disabled: !!node.disabled },
      disabled: node.disabled,
      checked: node.selected.peek() === node.value,
    }),
  mountControl: (_engine, _ctx, node) => ({
      disabled: node.disabled ?? false,
      draw: (ctx, r, state) => drawRadio(ctx, r, { label: node.label, value: node.value, selected: node.selected.peek(), visualStyle: node.visualStyle }, state, node.disabled ?? false),
      onClick: () => node.selected.set(node.value),
    }),
})

const textBoxHandler = widgetHandler<TextBoxNode, Parameters<typeof textBoxDescriptor.mount>[1]>({
  kind: "textbox",
  widgetType: "textbox",
  measure: (_engine, ctx, node, max) => {
    const basis = node.placeholder && !node.value.peek() ? node.placeholder : node.value.peek()
    const w = measureTextWidth(ctx, basis || " ", fontString({
      fontFamily: theme.typography.family,
      fontSize: theme.typography.body.size,
      fontWeight: theme.typography.body.weight,
      lineHeight: theme.spacing.lg,
    }))
    return { w: Math.min(max.w, Math.max(theme.ui.controls.minFieldWidth, w + 16)), h: theme.ui.controls.inputHeight }
  },
  mountWidget: (engine, _ctx, node, _ast, path) => ({
    behavior: { value: node.value, placeholder: node.placeholder },
    visual: { fieldStyle: node.visualStyle },
    disabled: node.disabled,
    runtimeState: { key: path, store: engine.runtime.nodeStateStore },
  }),
})

const rowItemHandler = controlHandler<RowNode>({
  kind: "listRow",
  measure: (_engine, ctx, node, max) => {
    const measured = measureVisualNode(ctx, buildListRowVisual({
      leftText: node.leftText,
      rightText: node.rightText,
      indent: node.indent,
      variant: node.variant,
      selected: node.selected,
      visualStyle: node.visualStyle,
    }, {
      state: { hover: false, pressed: false, dragging: false, disabled: false },
      selected: node.selected,
    }), max, {
      state: { hover: false, pressed: false, dragging: false, disabled: false },
      selected: node.selected,
    })
    return { w: max.w, h: Math.max(theme.ui.controls.rowHeight, measured.h) }
  },
  mountControl: (_engine, _ctx, node) => ({
      draw: (ctx, r, state) => drawListRow(ctx, r, { leftText: node.leftText, rightText: node.rightText, indent: node.indent, variant: node.variant, selected: node.selected, visualStyle: node.visualStyle }, state),
      onClick: node.onClick,
      onDoubleClick: node.onDoubleClick,
    }),
})

const treeViewHandler = primitiveHandler<TreeViewNode>({
  kind: "treeView",
  runtimeKind: "widget",
  measure: (_engine, _ctx, node, max) => {
    const rows = flattenTreeItems(node.items, node.expanded)
    return { w: max.w, h: rows.length * TREE_ROW_HEIGHT }
  },
  mount: (engine, _ctx, node, ast, path, active) => {
    engine.runtime.mountTreeView(path, ast.rect ?? ZERO_RECT, node, active)
  },
})

const scrollAreaHandler = widgetHandler<ScrollAreaNode, { child: RenderElement; createTreeSurface: ReturnType<RenderEngine["runtime"]["treeSurfaceFactory"]>; measureCtx?: CanvasRenderingContext2D }>({
  kind: "scrollArea",
  widgetType: "scrollArea",
  measure: (engine, ctx, node, max, path, ast) => {
    const childAst = engine.toAst(node.child, ctx, `${path}/content`, ast.inheritedEnv)
    const child = measureLayout(childAst, { w: max.w, h: Number.POSITIVE_INFINITY })
    return { w: max.w, h: Math.min(max.h, child.h) }
  },
  mountWidget: (engine, ctx, node) => ({ child: node.child, createTreeSurface: engine.runtime.treeSurfaceFactory(), measureCtx: ctx }),
})

const paintHandler = primitiveHandler<PaintNode>({
  kind: "paint",
  measure: (_engine, _ctx, node, max) => node.measure?.(max) ?? { w: max.w, h: 0 },
  mount: (engine, _ctx, node, ast, _path, active) => {
    const rect = ast.rect ?? ZERO_RECT
    engine.drawOps.push((canvas) => {
      node.draw(canvas, rect, active)
    })
  },
})

const sliderHandler = controlHandler<SliderNode>({
  kind: "slider",
  measure: (_engine, ctx, node, max) => {
    return { w: max.w, h: 20 }
  },
  mountControl: (_engine, _ctx, node, ast) => {
    const rect = ast.rect ?? ZERO_RECT
    return {
      disabled: node.disabled ?? false,
      draw: (ctx, nextRect, state) => drawSlider(ctx, nextRect, { min: node.min, max: node.max, value: node.value, visualStyle: node.visualStyle }, state),
      onPointerDown: (e) => {
        if (!node.onChange) return
        node.onChange(resolveSliderValueFromPointer(rect, { min: node.min, max: node.max, value: node.value, visualStyle: node.visualStyle }, { x: e.x, y: e.y }))
        e.capture()
        e.handle()
      },
      onPointerMove: (e) => {
        if (!node.onChange) return
        node.onChange(resolveSliderValueFromPointer(rect, { min: node.min, max: node.max, value: node.value, visualStyle: node.visualStyle }, { x: e.x, y: e.y }))
        e.handle()
      },
      onPointerUp: (e) => {
        if (!node.onChange) return
        node.onChange(resolveSliderValueFromPointer(rect, { min: node.min, max: node.max, value: node.value, visualStyle: node.visualStyle }, { x: e.x, y: e.y }))
        e.handle()
      },
    }
  },
})

export function createDefaultBuilderRegistry() {
  const registry = new RenderRegistry()
  registry.register(containerHandler)
  registry.register({ ...containerHandler, kind: "row" })
  registry.register({ ...containerHandler, kind: "column" })
  registry.register({ ...containerHandler, kind: "stack" })
  registry.register(textHandler)
  registry.register(labelHandler)
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
  return registry
}
