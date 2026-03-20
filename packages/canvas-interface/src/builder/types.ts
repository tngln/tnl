import type { Signal } from "../reactivity"
import type { RichTextSpan, RichTextStyle, TextEmphasis } from "../draw"
import type { IconDef } from "../icons"
import type { LayoutNode, LayoutStyle } from "../layout"
import type { Surface } from "../viewport"
import type { VisualImageSource, VisualStyleInput } from "./visual"

export type BoxStyle = {
  fill?: string
  stroke?: string
  radius?: number
}

export type TextEnv = {
  color?: string
  fontFamily?: string
  fontSize?: number
  fontWeight?: number
  lineHeight?: number
  emphasis?: TextEmphasis
}

export type NodeEnv = {
  text?: TextEnv
}

export type TextOverflow = "visible" | "truncate" | "clip"

export type RetainedKind = "primitive" | "control" | "widget"

type NodeBase = {
  key?: string
  style?: LayoutStyle
  active?: boolean
  visible?: boolean
  box?: BoxStyle
  provideEnv?: Partial<NodeEnv>
  envOverride?: Partial<NodeEnv>
}

export type CommonNodeProps = NodeBase

export type ContainerNode = NodeBase & {
  kind: "flex" | "row" | "column" | "stack"
  children: RenderElement[]
}

type ContentTextNode = NodeBase & {
  kind: "text"
  text: string
  color?: string
  emphasis?: TextEmphasis
}

export type LabelNode = NodeBase & {
  kind: "label"
  text: string
  color?: string
  emphasis?: TextEmphasis
  overflow?: TextOverflow
}

export type RichTextNode = NodeBase & {
  kind: "richText"
  spans: RichTextSpan[]
  textStyle?: RichTextStyle
  align?: "start" | "center" | "end"
  selectable?: boolean
}

export type ButtonNode = NodeBase & {
  kind: "button"
  text: string
  title?: string
  visualStyle?: VisualStyleInput
  leadingIcon?: VisualImageSource | IconDef | string
  trailingIcon?: VisualImageSource | IconDef | string
  onClick?: () => void
  disabled?: boolean
}

export type ClickAreaNode = NodeBase & {
  kind: "clickArea"
  onClick?: () => void
  disabled?: boolean
}

export type CheckboxNode = NodeBase & {
  kind: "checkbox"
  label: string
  checked: Signal<boolean>
  visualStyle?: VisualStyleInput
  disabled?: boolean
}

export type DropdownNode = NodeBase & {
  kind: "dropdown"
  options: Array<{ value: string; label: string }>
  selected: Signal<string>
  visualStyle?: VisualStyleInput
  disabled?: boolean
}

export type RadioNode = NodeBase & {
  kind: "radio"
  label: string
  value: string
  selected: Signal<string>
  visualStyle?: VisualStyleInput
  disabled?: boolean
}

export type TextBoxNode = NodeBase & {
  kind: "textbox"
  value: Signal<string>
  placeholder?: string
  visualStyle?: VisualStyleInput
  disabled?: boolean
}

export type RowVariant = "group" | "item"

export type RowNode = NodeBase & {
  kind: "listRow" | "rowItem"
  leftText: string
  rightText?: string
  indent?: number
  variant?: RowVariant
  selected?: boolean
  visualStyle?: VisualStyleInput
  onClick?: () => void
  onDoubleClick?: () => void
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
  child: RenderElement
}

export type PaintNode = NodeBase & {
  kind: "paint"
  draw: (ctx: CanvasRenderingContext2D, rect: { x: number; y: number; w: number; h: number }, active: boolean) => void
  measure?: (max: { w: number; h: number }) => { w: number; h: number }
}

export type SliderNode = NodeBase & {
  kind: "slider"
  min: number
  max: number
  value: number
  visualStyle?: VisualStyleInput
  onChange?: (next: number) => void
  disabled?: boolean
}

export type RenderElement =
  | ContainerNode
  | ContentTextNode
  | LabelNode
  | RichTextNode
  | ButtonNode
  | ClickAreaNode
  | CheckboxNode
  | DropdownNode
  | RadioNode
  | TextBoxNode
  | RowNode
  | TreeViewNode
  | ScrollAreaNode
  | PaintNode
  | SliderNode

export type AstNode = LayoutNode & {
  builder: RenderElement
  inheritedEnv: NodeEnv
  resolvedEnv: NodeEnv
  children?: AstNode[]
}

export type SurfaceRender<P> = (props: P) => RenderElement
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
