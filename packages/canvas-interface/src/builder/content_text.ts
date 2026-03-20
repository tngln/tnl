import type { RenderElement } from "./types"

export type ContentTextElement = Extract<RenderElement, { kind: "text" }>

export function contentTextNode(text: string, opts: Omit<ContentTextElement, "kind" | "text"> = {}): RenderElement {
  return { kind: "text", text, ...opts }
}
