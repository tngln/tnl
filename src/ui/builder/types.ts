import type { Signal } from "../../core/reactivity"
import type { RichTextSpan, RichTextStyle, TextEmphasis } from "../../core/draw.text"
import type { LayoutNode, LayoutStyle } from "../../core/layout"
import type { Surface } from "../base/viewport"

export type BoxStyle = {
  fill?: string
  stroke?: string
  radius?: number
}

export type InheritedTextStyle = {
  color?: string
  fontFamily?: string
  fontSize?: number
  fontWeight?: number
  lineHeight?: number
  emphasis?: TextEmphasis
}

export type InheritedSurfaceStyle = {
  tone?: "default" | "subtle"
  density?: "comfortable" | "compact"
  panelFill?: string
  panelStroke?: string
  sectionFill?: string
  sectionStroke?: string
  scrollFill?: string
}

export type InheritedStyle = {
  text?: InheritedTextStyle
  surface?: InheritedSurfaceStyle
}

type NodeBase = {
  key?: string
  style?: LayoutStyle
  active?: boolean
  visible?: boolean
  box?: BoxStyle
  provideStyle?: Partial<InheritedStyle>
  styleOverride?: Partial<InheritedStyle>
}

export type CommonNodeProps = NodeBase

export type ContainerNode = NodeBase & {
  kind: "row" | "column" | "stack"
  children: BuilderNode[]
}

export type SpacerNode = NodeBase & {
  kind: "spacer"
}

export type TextNode = NodeBase & {
  kind: "text"
  text: string
  color?: string
  emphasis?: TextEmphasis
}

export type RichTextNode = NodeBase & {
  kind: "richText"
  spans: RichTextSpan[]
  textStyle?: RichTextStyle
  align?: "start" | "center" | "end"
}

export type ButtonNode = NodeBase & {
  kind: "button"
  text: string
  title?: string
  onClick?: () => void
  disabled?: boolean
}

export type CheckboxNode = NodeBase & {
  kind: "checkbox"
  label: string
  checked: Signal<boolean>
  disabled?: boolean
}

export type RadioNode = NodeBase & {
  kind: "radio"
  label: string
  value: string
  selected: Signal<string>
  disabled?: boolean
}

export type RowVariant = "group" | "item"

export type RowNode = NodeBase & {
  kind: "rowItem"
  leftText: string
  rightText?: string
  indent?: number
  variant?: RowVariant
  selected?: boolean
  onClick?: () => void
}

export type TreeItem = {
  id: string
  label: string
  meta?: string
  variant?: RowVariant
  children?: TreeItem[]
}

export type TreeViewNode = NodeBase & {
  kind: "treeView"
  items: TreeItem[]
  expanded: ReadonlySet<string>
  selectedId?: string | null
  onToggle?: (id: string) => void
  onSelect?: (id: string) => void
}

export type ScrollAreaNode = NodeBase & {
  kind: "scrollArea"
  child: BuilderNode
}

export type BuilderNode =
  | ContainerNode
  | SpacerNode
  | TextNode
  | RichTextNode
  | ButtonNode
  | CheckboxNode
  | RadioNode
  | RowNode
  | TreeViewNode
  | ScrollAreaNode

export type AstNode = LayoutNode & {
  builder: BuilderNode
  inherited: InheritedStyle
  resolved: InheritedStyle
  children?: AstNode[]
}

export type SurfaceRender<P> = (props: P) => BuilderNode
export type SurfaceSetupResult<P> = SurfaceRender<P> | { render: SurfaceRender<P> }
export type SurfaceSetup<P> = (props: P) => SurfaceSetupResult<P>

export type MountedSurface<P> = Surface & {
  setProps(props: P): void
}

export type SurfaceDefinition<P> = {
  readonly kind: "surface-definition"
  readonly displayName: string
  mount(props: P): MountedSurface<P>
}

export type SurfaceComponent<P> = SurfaceDefinition<P>

export type SurfaceMountSpec<P> = {
  kind: "surface-mount"
  definition: SurfaceDefinition<P>
  props: P
}
