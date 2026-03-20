import type { Signal } from "../reactivity"
import type { RichTextSpan } from "../draw"
import type { LayoutStyle } from "../layout"
import type { RenderElement, ButtonElement, CheckboxElement, ClickAreaElement, CommonNodeProps, DropdownElement, LabelElement, PaintElement, RadioElement, RichTextElement, RowElement, ScrollAreaElement, SliderElement, TextBoxElement, TreeItem, TreeViewElement } from "./types"

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

export function labelNode(text: string, opts: Omit<LabelElement, "kind" | "text"> = {}): RenderElement {
  return { kind: "label", text, ...opts }
}

export function richTextNode(spans: RichTextSpan[], opts: Omit<RichTextElement, "kind" | "spans">): RenderElement {
  return { kind: "richText", spans, ...opts }
}

export function buttonNode(text: string, opts: Omit<ButtonElement, "kind" | "text"> = {}): RenderElement {
  return { kind: "button", text, ...opts }
}

export function clickAreaNode(opts: Omit<ClickAreaElement, "kind"> = {}): RenderElement {
  return { kind: "clickArea", ...opts }
}

export function checkboxNode(label: string, checked: Signal<boolean>, opts: Omit<CheckboxElement, "kind" | "label" | "checked"> = {}): RenderElement {
  return { kind: "checkbox", label, checked, ...opts }
}

export function dropdownNode(options: DropdownElement["options"], selected: Signal<string>, opts: Omit<DropdownElement, "kind" | "options" | "selected"> = {}): RenderElement {
  return { kind: "dropdown", options, selected, ...opts }
}

export function radioNode(label: string, value: string, selected: Signal<string>, opts: Omit<RadioElement, "kind" | "label" | "value" | "selected"> = {}): RenderElement {
  return { kind: "radio", label, value, selected, ...opts }
}

export function textBoxNode(value: Signal<string>, opts: Omit<TextBoxElement, "kind" | "value"> = {}): RenderElement {
  return { kind: "textbox", value, ...opts }
}

export function rowItemNode(opts: Omit<RowElement, "kind">): RenderElement {
  return { kind: "listRow", ...opts }
}

export function listRowNode(opts: Omit<RowElement, "kind">): RenderElement {
  return { kind: "listRow", ...opts }
}

export function treeItem(id: string, label: string, opts: Omit<TreeItem, "id" | "label"> = {}): TreeItem {
  return { id, label, ...opts }
}

export function treeViewNode(opts: Omit<TreeViewElement, "kind">): RenderElement {
  return { kind: "treeView", ...opts }
}

export function scrollAreaNode(child: RenderElement, opts: Omit<ScrollAreaElement, "kind" | "child"> = {}): RenderElement {
  return { kind: "scrollArea", child, ...opts }
}

export function paintNode(opts: Omit<PaintElement, "kind">): RenderElement {
  return { kind: "paint", ...opts }
}

export function sliderNode(opts: Omit<SliderElement, "kind">): RenderElement {
  return { kind: "slider", ...opts }
}
