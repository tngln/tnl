import type { BuilderElement } from "./jsx"

declare global {
  namespace JSX {
    type Element = BuilderElement
    interface ElementChildrenAttribute {
      children: {}
    }
    interface IntrinsicElements {
      b: { children?: unknown }
      i: { children?: unknown }
      u: { children?: unknown }
      span: { children?: unknown; tone?: "primary" | "muted"; color?: string }
    }
  }
}

export {}
