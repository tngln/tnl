import { contentTextNode } from "./builder/content_text"
import { isRichInlineNode, richTextElement, type RichInlineChild } from "./builder/rich_text_children"
import type { RenderElement, BoxStyle, CommonNodeProps } from "./builder/surface_builder"

export type RenderLeaf = RenderElement | string | number | null | undefined | false
export type RenderChild = RenderLeaf | RenderChild[]
export type Renderable = RenderElement | RenderChild[] | RichInlineChild
export type Component<P = {}> = (props: P & { children?: RenderChild[] }) => Renderable

type ComponentProps = CommonNodeProps & { children?: RenderChild | RenderChild[] }

function appendFlattened(out: RenderChild[], value: RenderChild) {
  if (Array.isArray(value)) {
    for (const item of value) appendFlattened(out, item)
    return
  }
  if (value === null || value === undefined || value === false) return
  out.push(value)
}

export function flattenChildren(children: RenderChild[]) {
  const out: RenderChild[] = []
  for (const child of children) appendFlattened(out, child)
  return out
}

export function normalizeChildren(children: RenderChild[]) {
  const flat = flattenChildren(children)
  const out: RenderElement[] = []
  for (const child of flat) {
    if (isRichInlineNode(child)) throw new Error("RichText intrinsic tags can only be used inside <RichText>.")
    if (typeof child === "string" || typeof child === "number") out.push(contentTextNode(String(child)))
    else out.push(child as RenderElement)
  }
  return out
}

export function takeTextContent(children: RenderChild[] | undefined) {
  const flat = children ? flattenChildren(children) : []
  let text = ""
  for (const child of flat) {
    if (typeof child === "string" || typeof child === "number") text += String(child)
  }
  return text
}

/** Extract raw children array from JSX props. */
function rawChildren(props: { children?: RenderChild | RenderChild[] }): RenderChild[] {
  if (Array.isArray(props.children)) return props.children
  return props.children !== undefined ? [props.children] : []
}

/** Resolve JSX children into a normalized RenderElement array. */
export function resolveChildren(props: { children?: RenderChild | RenderChild[] }): RenderElement[] {
  return normalizeChildren(rawChildren(props))
}

/** Extract text content from JSX children props. */
export function resolveTextContent(props: { children?: RenderChild | RenderChild[] }): string {
  return takeTextContent(rawChildren(props) || undefined)
}

export function createElement<P>(
  type: string | Component<P>,
  props: (P & ComponentProps) | null,
  ...children: RenderChild[]
): Renderable {
  const nextProps = {
    ...(props ?? {}),
    ...(children.length > 0 ? { children } : {}),
  } as P & { children?: RenderChild[] }
  if (type === Fragment) return children
  if (type === "b" || type === "i" || type === "u" || type === "span") {
    return richTextElement(type, nextProps as { children?: RichInlineChild[]; tone?: "primary" | "muted"; color?: string })
  }
  if (typeof type === "function") return type(nextProps)
  throw new Error(`Unsupported JSX element type: ${String(type)}`)
}

export function Fragment(props: { children?: RenderChild[] }) {
  return props.children ?? []
}

export type JSXNodeProps = CommonNodeProps & {
  key?: string
  style?: CommonNodeProps["style"]
  active?: boolean
  visible?: boolean
  box?: BoxStyle
  children?: RenderChild | RenderChild[]
}
