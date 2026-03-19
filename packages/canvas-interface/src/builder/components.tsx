import { theme, neutral } from "../theme"
import type { LayoutStyle } from "../layout"
import type { Signal } from "../reactivity"
import type { IconDef } from "../icons"
import type { VisualImageSource, VisualStyleInput } from "./visual"
import {
  buttonNode,
  checkboxNode,
  clickAreaNode,
  dropdownNode,
  column,
  flex,
  formRow,
  paintNode,
  radioNode,
  richTextNode,
  row,
  rowItemNode,
  scrollAreaNode,
  section,
  sliderNode,
  spacer,
  stack,
  textBoxNode,
  treeViewNode,
  textNode,
  toolbarRow,
  type BoxStyle,
  type BuilderNode,
  type CommonNodeProps,
  type InheritedStyle,
  type RowVariant,
  type TreeItem,
} from "./surface_builder"
import type { RichTextSpan, RichTextStyle, TextEmphasis } from "../draw"
import { resolveChildren, resolveTextContent, type JSXNodeProps } from "../jsx"
import { resolveRichTextChildren, type RichInlineChild } from "./rich_text_children"

type ContainerProps = JSXNodeProps

type TextProps = JSXNodeProps & {
  text?: string
  color?: string
  emphasis?: TextEmphasis
  tone?: "primary" | "muted"
  weight?: "normal" | "bold"
  size?: "body" | "headline" | "meta"
}

type RichTextProps = Omit<JSXNodeProps, "children"> & {
  spans?: RichTextSpan[]
  textStyle?: RichTextStyle
  align?: "start" | "center" | "end"
  tone?: "primary" | "muted"
  weight?: "normal" | "bold"
  size?: "body" | "headline" | "meta"
  selectable?: boolean
  children?: RichInlineChild | RichInlineChild[]
}

type ButtonProps = JSXNodeProps & {
  text?: string
  title?: string
  appearance?: string | string[]
  visualStyle?: VisualStyleInput
  leadingIcon?: VisualImageSource | IconDef | string
  trailingIcon?: VisualImageSource | IconDef | string
  onClick?: () => void
  disabled?: boolean
}

type ClickAreaProps = JSXNodeProps & {
  onClick?: () => void
  disabled?: boolean
}

type CheckboxProps = JSXNodeProps & {
  label?: string
  checked: Signal<boolean>
  appearance?: string | string[]
  visualStyle?: VisualStyleInput
  disabled?: boolean
}

type DropdownProps = Omit<JSXNodeProps, "children"> & {
  options: Array<{ value: string; label: string }>
  selected: Signal<string>
  disabled?: boolean
}

type RadioProps = JSXNodeProps & {
  label?: string
  value: string
  selected: Signal<string>
  appearance?: string | string[]
  visualStyle?: VisualStyleInput
  disabled?: boolean
}

type TextBoxProps = Omit<JSXNodeProps, "children"> & {
  value: Signal<string>
  placeholder?: string
  disabled?: boolean
}

type RowItemProps = JSXNodeProps & {
  leftText: string
  rightText?: string
  indent?: number
  variant?: RowVariant
  selected?: boolean
  appearance?: string | string[]
  visualStyle?: VisualStyleInput
  onClick?: () => void
  onDoubleClick?: () => void
}

type ScrollAreaProps = JSXNodeProps

type PaintProps = Omit<JSXNodeProps, "children"> & {
  draw: (ctx: CanvasRenderingContext2D, rect: { x: number; y: number; w: number; h: number }, active: boolean) => void
  measure?: (max: { w: number; h: number }) => { w: number; h: number }
}

type SliderProps = Omit<JSXNodeProps, "children"> & {
  min: number
  max: number
  value: number
  appearance?: string | string[]
  visualStyle?: VisualStyleInput
  onChange?: (next: number) => void
  disabled?: boolean
}

type TreeViewProps = Omit<JSXNodeProps, "children"> & {
  items: TreeItem[]
  expanded: ReadonlySet<string>
  selectedId?: string | null
  onToggle?: (id: string) => void
  onSelect?: (id: string) => void
}

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

function common(base: {
  key?: string
  style?: CommonNodeProps["style"]
  active?: boolean
  visible?: boolean
  box?: BoxStyle
  provideStyle?: CommonNodeProps["provideStyle"]
  styleOverride?: CommonNodeProps["styleOverride"]
} | undefined): CommonNodeProps {
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

function commonWithoutStyle(base: {
  key?: string
  style?: CommonNodeProps["style"]
  active?: boolean
  visible?: boolean
  box?: BoxStyle
  provideStyle?: CommonNodeProps["provideStyle"]
  styleOverride?: CommonNodeProps["styleOverride"]
} | undefined): Omit<CommonNodeProps, "style"> {
  const next = common(base)
  const { style: _style, ...rest } = next
  return rest
}

function mergeInherited(base: Partial<InheritedStyle> | undefined, patch: Partial<InheritedStyle> | undefined): Partial<InheritedStyle> | undefined {
  if (!base && !patch) return undefined
  const text = {
    text: {
      ...(base?.text ?? {}),
      ...(patch?.text ?? {}),
    },
  }
  if (!Object.keys(text.text).length) return undefined
  return text
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
  else if (props.tone === "primary") text.color = theme.colors.text
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
  return column(resolveChildren(props), props.style, commonWithoutStyle(props))
}

export function VStack(props: ContainerProps) {
  return Column(props)
}

export function Row(props: ContainerProps) {
  return row(resolveChildren(props), props.style, commonWithoutStyle(props))
}

export function HStack(props: ContainerProps) {
  return Row(props)
}

export function Flex(props: ContainerProps & { axis?: "row" | "column" }) {
  const style = props.axis ? { ...(props.style ?? {}), axis: props.axis } : props.style
  return flex(resolveChildren(props), style, commonWithoutStyle(props))
}

export function Stack(props: ContainerProps) {
  return stack(resolveChildren(props), props.style, commonWithoutStyle(props))
}

export function Spacer(props: JSXNodeProps) {
  return spacer(props.style, common(props))
}

export function Text(props: TextProps) {
  const text = props.text ?? resolveTextContent(props)
  return textNode(text, {
    ...common(props),
    color: props.color,
    emphasis: props.emphasis,
    styleOverride: mergeInherited(props.styleOverride, inheritedTextPatch(props)),
  })
}

export function RichText(props: RichTextProps) {
  const hasSpans = props.spans !== undefined
  const hasChildren = props.children !== undefined && (!Array.isArray(props.children) || props.children.length > 0)
  if (hasSpans && hasChildren) throw new Error("RichText accepts either spans or children, not both.")
  const richChildren = props.children
  const spans = props.spans ?? resolveRichTextChildren(Array.isArray(richChildren) ? richChildren : richChildren !== undefined ? [richChildren] : undefined)
  return richTextNode(spans, {
    ...common(props),
    textStyle: props.textStyle,
    align: props.align,
    selectable: props.selectable,
    styleOverride: mergeInherited(props.styleOverride, inheritedTextPatch(props)),
  })
}

export function Button(props: ButtonProps) {
  return buttonNode(props.text ?? resolveTextContent(props), {
    ...common(props),
    title: props.title,
    appearance: props.appearance,
    visualStyle: props.visualStyle,
    leadingIcon: props.leadingIcon,
    trailingIcon: props.trailingIcon,
    onClick: props.onClick,
    disabled: props.disabled,
  })
}

export function ClickArea(props: ClickAreaProps) {
  return clickAreaNode({ ...common(props), onClick: props.onClick, disabled: props.disabled })
}

export function Checkbox(props: CheckboxProps) {
  return checkboxNode(props.label ?? resolveTextContent(props), props.checked, { ...common(props), appearance: props.appearance, visualStyle: props.visualStyle, disabled: props.disabled })
}

export function Dropdown(props: DropdownProps) {
  return dropdownNode(props.options, props.selected, { ...common(props), disabled: props.disabled })
}

export function Radio(props: RadioProps) {
  return radioNode(props.label ?? resolveTextContent(props), props.value, props.selected, { ...common(props), appearance: props.appearance, visualStyle: props.visualStyle, disabled: props.disabled })
}

export function TextBox(props: TextBoxProps) {
  return textBoxNode(props.value, { ...common(props), placeholder: props.placeholder, disabled: props.disabled })
}

export function RowItem(props: RowItemProps) {
  return rowItemNode({
    ...common(props),
    leftText: props.leftText,
    rightText: props.rightText,
    indent: props.indent,
    variant: props.variant,
    selected: props.selected,
    appearance: props.appearance,
    visualStyle: props.visualStyle,
    onClick: props.onClick,
    onDoubleClick: props.onDoubleClick,
  })
}

export function ListRow(props: RowItemProps) {
  return RowItem(props)
}

export function ScrollArea(props: ScrollAreaProps) {
  const children = resolveChildren(props)
  const child = children.length <= 1 ? (children[0] ?? spacer()) : column(children)
  return scrollAreaNode(child, common(props))
}

export function Paint(props: PaintProps) {
  return paintNode({
    ...common(props),
    draw: props.draw,
    measure: props.measure,
  })
}

export function SliderField(props: SliderProps) {
  return sliderNode({
    ...common(props),
    min: props.min,
    max: props.max,
    value: props.value,
    appearance: props.appearance,
    visualStyle: props.visualStyle,
    onChange: props.onChange,
    disabled: props.disabled,
  })
}

export function TreeView(props: TreeViewProps) {
  return treeViewNode({
    ...common(props),
    items: props.items,
    expanded: props.expanded,
    selectedId: props.selectedId,
    onToggle: props.onToggle,
    onSelect: props.onSelect,
  })
}

export function Section(props: SectionProps) {
  return section(props.title, resolveChildren(props), { ...common(props), style: props.style })
}

export function FormRow(props: FormRowProps) {
  return formRow(props.label, props.field, { ...common(props), labelWidth: props.labelWidth, style: props.style })
}

export function ToolbarRow(props: ToolbarRowProps) {
  return toolbarRow(resolveChildren(props), { ...common(props), style: props.style })
}

export function PanelColumn(props: PanelContainerProps) {
  return Column({
    ...props,
    style: mergeLayout({ padding: theme.spacing.sm, gap: theme.spacing.sm }, props.style),
    box: props.box,
    provideStyle: mergeInherited(
      {
        text: {
          color: theme.colors.text,
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
      ...resolveChildren(props),
    ],
  })
}

export function PanelActionRow(props: PanelActionRowProps) {
  const trailing = resolveChildren(props)
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
    box: mergeBox({ fill: neutral[800] }, props.box),
    provideStyle: props.provideStyle,
  })
}

export function PanelSection(props: SectionProps) {
  return Section({
    ...props,
    box: mergeBox(
      {
        fill: neutral[750],
        stroke: neutral[500],
      },
      props.box,
    ),
    provideStyle: mergeInherited(
      {
        text: {
          color: theme.colors.text,
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
