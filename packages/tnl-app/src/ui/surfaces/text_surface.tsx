import { createElement, Fragment } from "@tnl/canvas-interface/jsx"
import { PanelColumn, RichText, Text } from "@tnl/canvas-interface/builder/components"
import { defineSurface, mountSurface, type SurfaceDefinition } from "@tnl/canvas-interface/builder/surface_builder"
import { theme } from "@tnl/canvas-interface/theme"

type TextSurfaceProps = { title: string; body: string }

export const TextSurfaceDefinition: SurfaceDefinition<TextSurfaceProps> = defineSurface<TextSurfaceProps>({
  id: (props) => `TextSurface.${props.title}`,
  setup: (props) => () => (
    <PanelColumn style={{ padding: theme.spacing.md, gap: theme.spacing.xs }}>
      <Text key="title" size="headline" weight="bold">{props.title}</Text>
      <RichText
        key="body"
        tone="muted"
        style={{ grow: 1, basis: 0 }}
        spans={[{ text: props.body }]}
      />
    </PanelColumn>
  ),
})

/** Drop-in replacement: returns a Surface instance like the old `new TextSurface(opts)` */
export function TextSurface(opts: { id: string; title: string; body: string }) {
  return mountSurface(TextSurfaceDefinition, { title: opts.title, body: opts.body })
}
