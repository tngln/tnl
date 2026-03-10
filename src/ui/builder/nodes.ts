import { theme } from "../../config/theme"
import type { Signal } from "../../core/reactivity"
import type { RichTextSpan } from "../../core/draw.text"
import type { LayoutStyle } from "../../core/layout"
import type { BuilderNode, ButtonNode, CheckboxNode, CommonNodeProps, PaintNode, RadioNode, RichTextNode, RowNode, ScrollAreaNode, SliderNode, TextBoxNode, TextNode, TreeItem, TreeViewNode } from "./types"

type NodeBase = Omit<CommonNodeProps, "style">

export function column(children: BuilderNode[], style?: LayoutStyle, base?: NodeBase): BuilderNode {
  return { kind: "column", children, style, ...base }
}

export function row(children: BuilderNode[], style?: LayoutStyle, base?: NodeBase): BuilderNode {
  return { kind: "row", children, style, ...base }
}

export function stack(children: BuilderNode[], style?: LayoutStyle, base?: NodeBase): BuilderNode {
  return { kind: "stack", children, style, ...base }
}

export function spacer(style?: LayoutStyle, base?: NodeBase): BuilderNode {
  return { kind: "spacer", style, ...base }
}

export function textNode(text: string, opts: Omit<TextNode, "kind" | "text"> = {}): BuilderNode {
  return { kind: "text", text, ...opts }
}

export function richTextNode(spans: RichTextSpan[], opts: Omit<RichTextNode, "kind" | "spans">): BuilderNode {
  return { kind: "richText", spans, ...opts }
}

export function buttonNode(text: string, opts: Omit<ButtonNode, "kind" | "text"> = {}): BuilderNode {
  return { kind: "button", text, ...opts }
}

export function checkboxNode(label: string, checked: Signal<boolean>, opts: Omit<CheckboxNode, "kind" | "label" | "checked"> = {}): BuilderNode {
  return { kind: "checkbox", label, checked, ...opts }
}

export function radioNode(label: string, value: string, selected: Signal<string>, opts: Omit<RadioNode, "kind" | "label" | "value" | "selected"> = {}): BuilderNode {
  return { kind: "radio", label, value, selected, ...opts }
}

export function textBoxNode(value: Signal<string>, opts: Omit<TextBoxNode, "kind" | "value"> = {}): BuilderNode {
  return { kind: "textbox", value, ...opts }
}

export function rowItemNode(opts: Omit<RowNode, "kind">): BuilderNode {
  return { kind: "rowItem", ...opts }
}

export function treeItem(id: string, label: string, opts: Omit<TreeItem, "id" | "label"> = {}): TreeItem {
  return { id, label, ...opts }
}

export function treeViewNode(opts: Omit<TreeViewNode, "kind">): BuilderNode {
  return { kind: "treeView", ...opts }
}

export function scrollAreaNode(child: BuilderNode, opts: Omit<ScrollAreaNode, "kind" | "child"> = {}): BuilderNode {
  return { kind: "scrollArea", child, ...opts }
}

export function paintNode(opts: Omit<PaintNode, "kind">): BuilderNode {
  return { kind: "paint", ...opts }
}

export function sliderNode(opts: Omit<SliderNode, "kind">): BuilderNode {
  return { kind: "slider", ...opts }
}
