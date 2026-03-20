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
  labelNode,
  richTextNode,
  row,
  rowItemNode,
  scrollAreaNode,
  section,
  sliderNode,
  stack,
  textBoxNode,
  treeViewNode,
  toolbarRow,
  type BoxStyle,
  type RenderElement,
  type CommonNodeProps,
  type NodeEnv,
  type RowVariant,
  type TextOverflow,
  type TreeItem,
} from "./surface_builder"
import type { RichTextSpan, RichTextStyle, TextEmphasis } from "../draw"
import { resolveChildren, resolveTextContent, type JSXNodeProps } from "../jsx"
import { resolveRichTextChildren, type RichInlineChild } from "./rich_text_children"

type ContainerProps = JSXNodeProps

type LabelProps = JSXNodeProps & {
  text?: string
  color?: string
  emphasis?: TextEmphasis
  tone?: "primary" | "muted"
  weight?: "normal" | "bold"
  size?: "body" | "headline" | "meta"
  overflow?: TextOverflow
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
  visualStyle?: VisualStyleInput
  disabled?: boolean
}

type DropdownProps = Omit<JSXNodeProps, "children"> & {
  options: Array<{ value: string; label: string }>
  selected: Signal<string>
  visualStyle?: VisualStyleInput
  disabled?: boolean
}

type RadioProps = JSXNodeProps & {
  label?: string
  value: string
  selected: Signal<string>
  visualStyle?: VisualStyleInput
  disabled?: boolean
}

type TextBoxProps = Omit<JSXNodeProps, "children"> & {
  value: Signal<string>
  placeholder?: string
  visualStyle?: VisualStyleInput
  disabled?: boolean
}

type RowItemProps = JSXNodeProps & {
  leftText: string
  rightText?: string
  indent?: number
  variant?: RowVariant
  selected?: boolean
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
  field: RenderElement
  labelWidth?: number
}

type ToolbarRowProps = JSXNodeProps

type PanelContainerProps = JSXNodeProps

type SplitRowProps = Omit<JSXNodeProps, "children"> & {
  left?: RenderElement | RenderElement[]
  right?: RenderElement | RenderElement[]
}

export type PanelAction = {
  key?: string
  text: string
  icon?: VisualImageSource | IconDef | string
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
  provideEnv?: CommonNodeProps["provideEnv"]
  envOverride?: CommonNodeProps["envOverride"]
} | undefined): CommonNodeProps {
  return {
    key: base?.key,
    style: base?.style,
    active: base?.active,
    visible: base?.visible,
    box: base?.box,
    provideEnv: base?.provideEnv,
    envOverride: base?.envOverride,
  }
}

function commonWithoutStyle(base: {
  key?: string
  style?: CommonNodeProps["style"]
  active?: boolean
  visible?: boolean
  box?: BoxStyle
  provideEnv?: CommonNodeProps["provideEnv"]
  envOverride?: CommonNodeProps["envOverride"]
} | undefined): Omit<CommonNodeProps, "style"> {
  const next = common(base)
  const { style: _style, ...rest } = next
  return rest
}

function mergeEnv(base: Partial<NodeEnv> | undefined, patch: Partial<NodeEnv> | undefined): Partial<NodeEnv> | undefined {
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

function textEnvPatch(props: { tone?: "primary" | "muted"; weight?: "normal" | "bold"; size?: "body" | "headline" | "meta"; color?: string; emphasis?: TextEmphasis }): Partial<NodeEnv> | undefined {
  const text: NonNullable<NodeEnv["text"]> = {}
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

export function Label(props: LabelProps) {
  const text = props.text ?? resolveTextContent(props)
  return labelNode(text, {
    ...common(props),
    color: props.color,
    emphasis: props.emphasis,
    overflow: props.overflow,
    envOverride: mergeEnv(props.envOverride, textEnvPatch(props)),
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
    envOverride: mergeEnv(props.envOverride, textEnvPatch(props)),
  })
}

export function Button(props: ButtonProps) {
  return buttonNode(props.text ?? resolveTextContent(props), {
    ...common(props),
    title: props.title,
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
  return checkboxNode(props.label ?? resolveTextContent(props), props.checked, { ...common(props), visualStyle: props.visualStyle, disabled: props.disabled })
}

export function Dropdown(props: DropdownProps) {
  return dropdownNode(props.options, props.selected, { ...common(props), visualStyle: props.visualStyle, disabled: props.disabled })
}

export function Radio(props: RadioProps) {
  return radioNode(props.label ?? resolveTextContent(props), props.value, props.selected, { ...common(props), visualStyle: props.visualStyle, disabled: props.disabled })
}

export function TextBox(props: TextBoxProps) {
  return textBoxNode(props.value, { ...common(props), placeholder: props.placeholder, visualStyle: props.visualStyle, disabled: props.disabled })
}

export function RowItem(props: RowItemProps) {
  return rowItemNode({
    ...common(props),
    leftText: props.leftText,
    rightText: props.rightText,
    indent: props.indent,
    variant: props.variant,
    selected: props.selected,
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
  const child = children.length <= 1 ? (children[0] ?? column([])) : column(children)
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

function resolveSplitChildren(children: RenderElement | RenderElement[] | undefined) {
  if (children === undefined) return [] as RenderElement[]
  return Array.isArray(children) ? children : [children]
}

export function SplitRow(props: SplitRowProps) {
  const leftChildren = resolveSplitChildren(props.left)
  const rightChildren = resolveSplitChildren(props.right)
  const left = leftChildren.length <= 1
    ? (leftChildren[0] ?? undefined)
    : Row({ key: props.key ? `${props.key}.left` : undefined, style: { align: "center", gap: theme.spacing.sm, grow: 1, basis: 0 }, children: leftChildren })
  const right = rightChildren.length <= 1
    ? (rightChildren[0] ?? undefined)
    : Row({ key: props.key ? `${props.key}.right` : undefined, style: { align: "center", gap: theme.spacing.sm }, children: rightChildren })
  const children = [left, right].filter((child): child is RenderElement => child !== undefined)
  return Row({
    ...props,
    style: mergeLayout({ align: "center", justify: "space-between", gap: theme.spacing.sm }, props.style),
    children,
  })
}

export function SectionStack(props: ContainerProps) {
  return VStack({
    ...props,
    style: mergeLayout({ gap: theme.spacing.xs }, props.style),
  })
}

export function PanelColumn(props: PanelContainerProps) {
  return Column({
    ...props,
    style: mergeLayout({ padding: theme.spacing.sm, gap: theme.spacing.sm }, props.style),
    box: props.box,
    provideEnv: mergeEnv(
      {
        text: {
          color: theme.colors.text,
          fontFamily: theme.typography.family,
          fontSize: theme.typography.body.size,
          fontWeight: theme.typography.body.weight,
          lineHeight: theme.spacing.lg,
        },
      },
      props.provideEnv,
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
  const trailing = [
    ...(props.meta ? [Label({ key: props.key ? `${props.key}.meta` : undefined, tone: "muted", size: "meta", children: [props.meta] })] : []),
    ...resolveChildren(props),
  ]
  return SplitRow({
    ...props,
    style: mergeLayout({ align: "center" }, props.style),
    left: Label({ key: props.key ? `${props.key}.title` : undefined, weight: "bold", children: [props.title] }),
    right: trailing,
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
          text: compact ? "" : action.text,
          title: action.title ?? action.text,
          leadingIcon: action.icon,
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
    style: mergeLayout({ grow: 1, basis: 0, alignSelf: "stretch" }, props.style),
    box: mergeBox({ fill: neutral[800] }, props.box),
    provideEnv: props.provideEnv,
  })
}

export function PanelBody(props: PanelContainerProps) {
  return VStack({
    ...props,
    style: mergeLayout({ grow: 1, basis: 0, alignSelf: "stretch", gap: theme.spacing.sm }, props.style),
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
    provideEnv: mergeEnv(
      {
        text: {
          color: theme.colors.text,
          fontFamily: theme.typography.family,
          fontSize: theme.typography.body.size,
          fontWeight: theme.typography.body.weight,
          lineHeight: theme.spacing.lg,
        },
      },
      props.provideEnv,
    ),
  })
}
