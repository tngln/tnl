import type { BuilderElement } from "./jsx"

declare global {
  namespace JSX {
    type Element = BuilderElement
    interface ElementChildrenAttribute {
      children: {}
    }
    interface IntrinsicElements {}
  }
}

export {}
