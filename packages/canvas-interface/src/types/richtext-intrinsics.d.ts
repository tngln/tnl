declare namespace JSX {
  interface IntrinsicElements {
    b: { children?: unknown }
    i: { children?: unknown }
    u: { children?: unknown }
    span: { children?: unknown; tone?: "primary" | "muted"; color?: string }
  }
}
