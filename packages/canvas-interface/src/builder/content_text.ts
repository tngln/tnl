import type { RenderElement } from "./types"

export type ContentTextNode = Extract<RenderElement, { kind: "text" }>

export function contentTextNode(text: string, opts: Omit<ContentTextNode, "kind" | "text"> = {}): RenderElement {
  return { kind: "text", text, ...opts }
}
