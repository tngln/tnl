import type { Signal } from "../reactivity"
import type { RichTextSpan } from "../draw"
import type { LayoutStyle } from "../layout"
import type { RenderElement, ButtonNode, CheckboxNode, ClickAreaNode, CommonNodeProps, DropdownNode, LabelNode, PaintNode, RadioNode, RichTextNode, RowNode, ScrollAreaNode, SliderNode, TextBoxNode, TreeItem, TreeViewNode } from "./types"

type NodeBase = Omit<CommonNodeProps, "style">

export function column(children: RenderElement[], style?: LayoutStyle, base?: NodeBase): RenderElement {
  return { kind: "flex", children, style: { ...(style ?? {}), axis: "column" }, ...base }
}

export function row(children: RenderElement[], style?: LayoutStyle, base?: NodeBase): RenderElement {
  return { kind: "flex", children, style: { ...(style ?? {}), axis: "row" }, ...base }
}

export function flex(children: RenderElement[], style?: LayoutStyle, base?: NodeBase): RenderElement {
  return { kind: "flex", children, style, ...base }
}

export function stack(children: RenderElement[], style?: LayoutStyle, base?: NodeBase): RenderElement {
  return { kind: "stack", children, style, ...base }
}

export function labelNode(text: string, opts: Omit<LabelNode, "kind" | "text"> = {}): RenderElement {
  return { kind: "label", text, ...opts }
}

export function richTextNode(spans: RichTextSpan[], opts: Omit<RichTextNode, "kind" | "spans">): RenderElement {
  return { kind: "richText", spans, ...opts }
}

export function buttonNode(text: string, opts: Omit<ButtonNode, "kind" | "text"> = {}): RenderElement {
  return { kind: "button", text, ...opts }
}

export function clickAreaNode(opts: Omit<ClickAreaNode, "kind"> = {}): RenderElement {
  return { kind: "clickArea", ...opts }
}

export function checkboxNode(label: string, checked: Signal<boolean>, opts: Omit<CheckboxNode, "kind" | "label" | "checked"> = {}): RenderElement {
  return { kind: "checkbox", label, checked, ...opts }
}

export function dropdownNode(options: DropdownNode["options"], selected: Signal<string>, opts: Omit<DropdownNode, "kind" | "options" | "selected"> = {}): RenderElement {
  return { kind: "dropdown", options, selected, ...opts }
}

export function radioNode(label: string, value: string, selected: Signal<string>, opts: Omit<RadioNode, "kind" | "label" | "value" | "selected"> = {}): RenderElement {
  return { kind: "radio", label, value, selected, ...opts }
}

export function textBoxNode(value: Signal<string>, opts: Omit<TextBoxNode, "kind" | "value"> = {}): RenderElement {
  return { kind: "textbox", value, ...opts }
}

export function rowItemNode(opts: Omit<RowNode, "kind">): RenderElement {
  return { kind: "listRow", ...opts }
}

export function listRowNode(opts: Omit<RowNode, "kind">): RenderElement {
  return { kind: "listRow", ...opts }
}

export function treeItem(id: string, label: string, opts: Omit<TreeItem, "id" | "label"> = {}): TreeItem {
  return { id, label, ...opts }
}

export function treeViewNode(opts: Omit<TreeViewNode, "kind">): RenderElement {
  return { kind: "treeView", ...opts }
}

export function scrollAreaNode(child: RenderElement, opts: Omit<ScrollAreaNode, "kind" | "child"> = {}): RenderElement {
  return { kind: "scrollArea", child, ...opts }
}

export function paintNode(opts: Omit<PaintNode, "kind">): RenderElement {
  return { kind: "paint", ...opts }
}

export function sliderNode(opts: Omit<SliderNode, "kind">): RenderElement {
  return { kind: "slider", ...opts }
}
