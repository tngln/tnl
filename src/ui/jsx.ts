import { textNode } from "./builder/surface_builder"
import type { BuilderNode, BoxStyle, CommonNodeProps } from "./builder/surface_builder"

export type BuilderLeaf = BuilderNode | string | number | null | undefined | false
export type BuilderChild = BuilderLeaf | BuilderChild[]
export type BuilderElement = BuilderNode | BuilderChild[]
export type BuilderComponent<P = {}> = (props: P & { children?: BuilderChild[] }) => BuilderElement

type ComponentProps = CommonNodeProps & { children?: BuilderChild | BuilderChild[] }

function appendFlattened(out: BuilderChild[], value: BuilderChild) {
  if (Array.isArray(value)) {
    for (const item of value) appendFlattened(out, item)
    return
  }
  if (value === null || value === undefined || value === false) return
  out.push(value)
}

export function flattenChildren(children: BuilderChild[]) {
  const out: BuilderChild[] = []
  for (const child of children) appendFlattened(out, child)
  return out
}

export function normalizeChildren(children: BuilderChild[]) {
  const out: BuilderNode[] = []
  for (const child of flattenChildren(children)) {
    if (typeof child === "string" || typeof child === "number") out.push(textNode(String(child)))
    else out.push(child as BuilderNode)
  }
  return out
}

export function takeTextContent(children: BuilderChild[] | undefined) {
  const flat = children ? flattenChildren(children) : []
  let text = ""
  for (const child of flat) {
    if (typeof child === "string" || typeof child === "number") text += String(child)
  }
  return text
}

export function createElement<P>(
  type: string | BuilderComponent<P>,
  props: (P & ComponentProps) | null,
  ...children: BuilderChild[]
): BuilderElement {
  const nextProps = { ...(props ?? {}), children } as P & { children?: BuilderChild[] }
  if (type === Fragment) return children
  if (typeof type === "function") return type(nextProps)
  throw new Error(`Unsupported JSX element type: ${String(type)}`)
}

export function Fragment(props: { children?: BuilderChild[] }) {
  return props.children ?? []
}

export type JSXNodeProps = CommonNodeProps & {
  key?: string
  style?: CommonNodeProps["style"]
  active?: boolean
  visible?: boolean
  box?: BoxStyle
  children?: BuilderChild | BuilderChild[]
}
