import type { BuilderNode } from "./types"

export type ContentTextNode = Extract<BuilderNode, { kind: "text" }>

export function contentTextNode(text: string, opts: Omit<ContentTextNode, "kind" | "text"> = {}): BuilderNode {
  return { kind: "text", text, ...opts }
}
