import { theme } from "../../config/theme"
import type { Signal } from "../../core/reactivity"
import type { LayoutStyle } from "../../core/layout"
import {
  buttonNode,
  checkboxNode,
  column,
  formRow,
  radioNode,
  richTextNode,
  row,
  rowItemNode,
  scrollAreaNode,
  section,
  spacer,
  stack,
  textNode,
  toolbarRow,
  type BoxStyle,
  type BuilderNode,
  type CommonNodeProps,
  type RowVariant,
} from "./surface_builder"
import { normalizeChildren, takeTextContent, type BuilderChild, type JSXNodeProps } from "../jsx"
import type { RichTextSpan, RichTextStyle, TextEmphasis } from "../../core/draw.text"

type ContainerProps = JSXNodeProps

type TextProps = JSXNodeProps & {
  text?: string
  color?: string
  emphasis?: TextEmphasis
}

type RichTextProps = JSXNodeProps & {
  spans: RichTextSpan[]
  textStyle: RichTextStyle
  align?: "start" | "center" | "end"
}

type ButtonProps = JSXNodeProps & {
  text?: string
  onClick?: () => void
}

type CheckboxProps = JSXNodeProps & {
  label?: string
  checked: Signal<boolean>
}

type RadioProps = JSXNodeProps & {
  label?: string
  value: string
  selected: Signal<string>
}

type RowItemProps = JSXNodeProps & {
  leftText: string
  rightText?: string
  indent?: number
  variant?: RowVariant
  selected?: boolean
  onClick?: () => void
}

type ScrollAreaProps = JSXNodeProps

type SectionProps = JSXNodeProps & {
  title: string
}

type FormRowProps = JSXNodeProps & {
  label: string
  field: BuilderNode
  labelWidth?: number
}

type ToolbarRowProps = JSXNodeProps

function common(base: JSXNodeProps | undefined): CommonNodeProps {
  return {
    key: base?.key,
    style: base?.style,
    active: base?.active,
    visible: base?.visible,
    box: base?.box,
  }
}

export function Column(props: ContainerProps) {
  return column(normalizeChildren(Array.isArray(props.children) ? props.children : props.children !== undefined ? [props.children] : []), props.style, common(props))
}

export function Row(props: ContainerProps) {
  return row(normalizeChildren(Array.isArray(props.children) ? props.children : props.children !== undefined ? [props.children] : []), props.style, common(props))
}

export function Stack(props: ContainerProps) {
  return stack(normalizeChildren(Array.isArray(props.children) ? props.children : props.children !== undefined ? [props.children] : []), props.style, common(props))
}

export function Spacer(props: JSXNodeProps) {
  return spacer(props.style, common(props))
}

export function Text(props: TextProps) {
  const childText = takeTextContent(Array.isArray(props.children) ? props.children : props.children !== undefined ? [props.children] : undefined)
  const text = props.text ?? childText
  return textNode(text, { ...common(props), color: props.color, emphasis: props.emphasis })
}

export function RichText(props: RichTextProps) {
  return richTextNode(props.spans, { ...common(props), textStyle: props.textStyle, align: props.align })
}

export function Button(props: ButtonProps) {
  const childText = takeTextContent(Array.isArray(props.children) ? props.children : props.children !== undefined ? [props.children] : undefined)
  return buttonNode(props.text ?? childText, { ...common(props), onClick: props.onClick })
}

export function Checkbox(props: CheckboxProps) {
  const childText = takeTextContent(Array.isArray(props.children) ? props.children : props.children !== undefined ? [props.children] : undefined)
  return checkboxNode(props.label ?? childText, props.checked, common(props))
}

export function Radio(props: RadioProps) {
  const childText = takeTextContent(Array.isArray(props.children) ? props.children : props.children !== undefined ? [props.children] : undefined)
  return radioNode(props.label ?? childText, props.value, props.selected, common(props))
}

export function RowItem(props: RowItemProps) {
  return rowItemNode({ ...common(props), leftText: props.leftText, rightText: props.rightText, indent: props.indent, variant: props.variant, selected: props.selected, onClick: props.onClick })
}

export function ScrollArea(props: ScrollAreaProps) {
  const children = normalizeChildren(Array.isArray(props.children) ? props.children : props.children !== undefined ? [props.children] : [])
  const child = children.length <= 1 ? (children[0] ?? spacer()) : column(children, { axis: "column", gap: 0, w: "auto", h: "auto" })
  return scrollAreaNode(child, common(props))
}

export function Section(props: SectionProps) {
  const children = normalizeChildren(Array.isArray(props.children) ? props.children : props.children !== undefined ? [props.children] : [])
  return section(props.title, children, { key: props.key, box: props.box, style: props.style })
}

export function FormRow(props: FormRowProps) {
  return formRow(props.label, props.field, { key: props.key, labelWidth: props.labelWidth, style: props.style })
}

export function ToolbarRow(props: ToolbarRowProps) {
  const children = normalizeChildren(Array.isArray(props.children) ? props.children : props.children !== undefined ? [props.children] : [])
  return toolbarRow(children, { key: props.key, style: props.style })
}
