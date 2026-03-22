import type { Signal } from "../reactivity"
import type { RichTextSpan, RichTextStyle, TextEmphasis } from "../draw"
import type { IconDef } from "../icons"
import type { LayoutNode, LayoutStyle } from "../layout"
import type { Surface } from "../ui/viewport"
import type { VisualImageSource, VisualStyleInput } from "./visual"
import type { NodeEnv } from "./env"

export type BoxStyle = {
  fill?: string
  stroke?: string
  radius?: number
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

export type ContainerElement = NodeBase & {
  kind: "flex" | "row" | "column" | "stack"
  children: RenderElement[]
}

type ContentTextElement = NodeBase & {
  kind: "text"
  text: string
  color?: string
  emphasis?: TextEmphasis
}

export type LabelElement = NodeBase & {
  kind: "label"
  text: string
  color?: string
  emphasis?: TextEmphasis
  overflow?: TextOverflow
}

export type RichTextElement = NodeBase & {
  kind: "richText"
  spans: RichTextSpan[]
  textStyle?: RichTextStyle
  align?: "start" | "center" | "end"
  selectable?: boolean
}

export type ButtonElement = NodeBase & {
  kind: "button"
  text: string
  title?: string
  visualStyle?: VisualStyleInput
  leadingIcon?: VisualImageSource | IconDef | string
  trailingIcon?: VisualImageSource | IconDef | string
  onClick?: () => void
  disabled?: boolean
}

export type ClickAreaElement = NodeBase & {
  kind: "clickArea"
  onClick?: () => void
  disabled?: boolean
}

export type CheckboxElement = NodeBase & {
  kind: "checkbox"
  label: string
  checked: Signal<boolean>
  visualStyle?: VisualStyleInput
  disabled?: boolean
}

export type DropdownElement = NodeBase & {
  kind: "dropdown"
  options: Array<{ value: string; label: string }>
  selected: Signal<string>
  visualStyle?: VisualStyleInput
  disabled?: boolean
}

export type RadioElement = NodeBase & {
  kind: "radio"
  label: string
  value: string
  selected: Signal<string>
  visualStyle?: VisualStyleInput
  disabled?: boolean
}

export type TextBoxElement = NodeBase & {
  kind: "textbox"
  value: Signal<string>
  placeholder?: string
  visualStyle?: VisualStyleInput
  disabled?: boolean
}

export type RowVariant = "group" | "item"

export type RowElement = NodeBase & {
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

export type TreeViewElement = NodeBase & {
  kind: "treeView"
  items: TreeItem[]
  expanded: ReadonlySet<string>
  selectedId?: string | null
  onToggle?: (id: string) => void
  onSelect?: (id: string) => void
}

export type ScrollAreaElement = NodeBase & {
  kind: "scrollArea"
  child: RenderElement
}

export type PaintElement = NodeBase & {
  kind: "paint"
  draw: (ctx: CanvasRenderingContext2D, rect: { x: number; y: number; w: number; h: number }, active: boolean) => void
  measure?: (max: { w: number; h: number }) => { w: number; h: number }
}

export type SliderElement = NodeBase & {
  kind: "slider"
  min: number
  max: number
  value: number
  visualStyle?: VisualStyleInput
  onChange?: (next: number) => void
  disabled?: boolean
}

export type RenderElement =
  | ContainerElement
  | ContentTextElement
  | LabelElement
  | RichTextElement
  | ButtonElement
  | ClickAreaElement
  | CheckboxElement
  | DropdownElement
  | RadioElement
  | TextBoxElement
  | RowElement
  | TreeViewElement
  | ScrollAreaElement
  | PaintElement
  | SliderElement

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
