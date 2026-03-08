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
  type InheritedStyle,
  type RowVariant,
} from "./surface_builder"
import { normalizeChildren, takeTextContent, type BuilderChild, type JSXNodeProps } from "../jsx"
import type { RichTextSpan, RichTextStyle, TextEmphasis } from "../../core/draw.text"

type ContainerProps = JSXNodeProps

type TextProps = JSXNodeProps & {
  text?: string
  color?: string
  emphasis?: TextEmphasis
  tone?: "primary" | "muted"
  weight?: "normal" | "bold"
  size?: "body" | "headline" | "meta"
}

type RichTextProps = JSXNodeProps & {
  spans: RichTextSpan[]
  textStyle?: RichTextStyle
  align?: "start" | "center" | "end"
  tone?: "primary" | "muted"
  weight?: "normal" | "bold"
  size?: "body" | "headline" | "meta"
}

type ButtonProps = JSXNodeProps & {
  text?: string
  title?: string
  onClick?: () => void
  disabled?: boolean
}

type CheckboxProps = JSXNodeProps & {
  label?: string
  checked: Signal<boolean>
  disabled?: boolean
}

type RadioProps = JSXNodeProps & {
  label?: string
  value: string
  selected: Signal<string>
  disabled?: boolean
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

type PanelContainerProps = JSXNodeProps

export type PanelAction = {
  key?: string
  text: string
  icon?: string
  title?: string
  onClick?: () => void
  disabled?: boolean
  width?: number
}

type PanelActionRowProps = JSXNodeProps & {
  actions: PanelAction[]
  compact?: boolean
}

type PanelHeaderProps = JSXNodeProps & {
  title: string
  meta?: string
}

function common(base: JSXNodeProps | undefined): CommonNodeProps {
  return {
    key: base?.key,
    style: base?.style,
    active: base?.active,
    visible: base?.visible,
    box: base?.box,
    provideStyle: base?.provideStyle,
    styleOverride: base?.styleOverride,
  }
}

function mergeInherited(base: Partial<InheritedStyle> | undefined, patch: Partial<InheritedStyle> | undefined): Partial<InheritedStyle> | undefined {
  if (!base && !patch) return undefined
  return {
    text: {
      ...(base?.text ?? {}),
      ...(patch?.text ?? {}),
    },
    surface: {
      ...(base?.surface ?? {}),
      ...(patch?.surface ?? {}),
    },
  }
}

function mergeLayout(base: LayoutStyle, patch: LayoutStyle | undefined) {
  return { ...base, ...(patch ?? {}) }
}

function mergeBox(base: BoxStyle, patch: BoxStyle | undefined): BoxStyle {
  return { ...base, ...(patch ?? {}) }
}

function inheritedTextPatch(props: { tone?: "primary" | "muted"; weight?: "normal" | "bold"; size?: "body" | "headline" | "meta"; color?: string; emphasis?: TextEmphasis }): Partial<InheritedStyle> | undefined {
  const text: NonNullable<InheritedStyle["text"]> = {}
  if (props.color) text.color = props.color
  else if (props.tone === "muted") text.color = theme.colors.textMuted
  else if (props.tone === "primary") text.color = theme.colors.textPrimary
  if (props.size === "headline") {
    text.fontSize = theme.typography.headline.size
    text.fontWeight = theme.typography.headline.weight
    text.lineHeight = theme.spacing.lg
  } else if (props.size === "meta") {
    text.fontSize = Math.max(10, theme.typography.body.size - 1)
    text.fontWeight = theme.typography.body.weight
    text.lineHeight = theme.spacing.md
  } else if (props.size === "body") {
    text.fontSize = theme.typography.body.size
    text.fontWeight = theme.typography.body.weight
    text.lineHeight = theme.spacing.lg
  }
  if (props.weight === "bold") text.fontWeight = 700
  if (props.weight === "normal") text.fontWeight = 400
  if (props.emphasis) text.emphasis = props.emphasis
  return Object.keys(text).length ? { text } : undefined
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
  return textNode(text, {
    ...common(props),
    color: props.color,
    emphasis: props.emphasis,
    styleOverride: mergeInherited(props.styleOverride, inheritedTextPatch(props)),
  })
}

export function RichText(props: RichTextProps) {
  return richTextNode(props.spans, {
    ...common(props),
    textStyle: props.textStyle,
    align: props.align,
    styleOverride: mergeInherited(props.styleOverride, inheritedTextPatch(props)),
  })
}

export function Button(props: ButtonProps) {
  const childText = takeTextContent(Array.isArray(props.children) ? props.children : props.children !== undefined ? [props.children] : undefined)
  return buttonNode(props.text ?? childText, { ...common(props), title: props.title, onClick: props.onClick, disabled: props.disabled })
}

export function Checkbox(props: CheckboxProps) {
  const childText = takeTextContent(Array.isArray(props.children) ? props.children : props.children !== undefined ? [props.children] : undefined)
  return checkboxNode(props.label ?? childText, props.checked, { ...common(props), disabled: props.disabled })
}

export function Radio(props: RadioProps) {
  const childText = takeTextContent(Array.isArray(props.children) ? props.children : props.children !== undefined ? [props.children] : undefined)
  return radioNode(props.label ?? childText, props.value, props.selected, { ...common(props), disabled: props.disabled })
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
  return section(props.title, children, { ...common(props), style: props.style })
}

export function FormRow(props: FormRowProps) {
  return formRow(props.label, props.field, { ...common(props), labelWidth: props.labelWidth, style: props.style })
}

export function ToolbarRow(props: ToolbarRowProps) {
  const children = normalizeChildren(Array.isArray(props.children) ? props.children : props.children !== undefined ? [props.children] : [])
  return toolbarRow(children, { ...common(props), style: props.style })
}

export function PanelColumn(props: PanelContainerProps) {
  return Column({
    ...props,
    style: mergeLayout({ axis: "column", padding: theme.spacing.sm, gap: theme.spacing.sm, w: "auto", h: "auto" }, props.style),
    box: props.box,
    provideStyle: mergeInherited(
      {
        text: {
          color: theme.colors.textPrimary,
          fontFamily: theme.typography.family,
          fontSize: theme.typography.body.size,
          fontWeight: theme.typography.body.weight,
          lineHeight: theme.spacing.lg,
        },
        surface: {
          tone: "default",
          density: "comfortable",
        },
      },
      props.provideStyle,
    ),
  })
}

export function PanelToolbar(props: ToolbarRowProps) {
  return ToolbarRow({
    ...props,
    style: mergeLayout({ align: "center", gap: theme.spacing.sm }, props.style),
  })
}

export function PanelHeader(props: PanelHeaderProps) {
  return PanelToolbar({
    ...props,
    children: [
      Text({ key: props.key ? `${props.key}.title` : undefined, weight: "bold", children: [props.title] }),
      Spacer({ style: { fill: true } }),
      ...(props.meta ? [Text({ key: props.key ? `${props.key}.meta` : undefined, tone: "muted", size: "meta", children: [props.meta] })] : []),
      ...normalizeChildren(Array.isArray(props.children) ? props.children : props.children !== undefined ? [props.children] : []),
    ],
  })
}

export function PanelActionRow(props: PanelActionRowProps) {
  const trailing = normalizeChildren(Array.isArray(props.children) ? props.children : props.children !== undefined ? [props.children] : [])
  const compact = props.compact ?? false
  return PanelToolbar({
    ...props,
    style: mergeLayout({ gap: compact ? theme.spacing.xs : theme.spacing.sm }, props.style),
    children: [
      ...props.actions.map((action, index) => (
        Button({
          key: action.key ?? `action.${index}`,
          text: action.icon ? (compact ? action.icon : `${action.icon} ${action.text}`) : action.text,
          title: action.title ?? action.text,
          onClick: action.onClick,
          disabled: action.disabled,
          style: { fixed: action.width ?? (compact ? 32 : 78) },
        })
      )),
      ...trailing,
    ],
  })
}

export function PanelScroll(props: PanelContainerProps) {
  return ScrollArea({
    ...props,
    style: mergeLayout({ fill: true }, props.style),
    box: mergeBox({ fill: "rgba(255,255,255,0.01)" }, props.box),
    provideStyle: mergeInherited(
      {
        surface: {
          tone: "subtle",
          scrollFill: "rgba(255,255,255,0.01)",
        },
      },
      props.provideStyle,
    ),
  })
}

export function PanelSection(props: SectionProps) {
  return Section({
    ...props,
    box: mergeBox(
      {
        fill: "rgba(255,255,255,0.02)",
        stroke: "rgba(255,255,255,0.08)",
      },
      props.box,
    ),
    provideStyle: mergeInherited(
      {
        text: {
          color: theme.colors.textPrimary,
          fontFamily: theme.typography.family,
          fontSize: theme.typography.body.size,
          fontWeight: theme.typography.body.weight,
          lineHeight: theme.spacing.lg,
        },
      },
      props.provideStyle,
    ),
  })
}
