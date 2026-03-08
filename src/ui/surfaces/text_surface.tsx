import { createElement, Fragment } from "../jsx"
import { PanelColumn, RichText, Text } from "../builder/components"
import { defineSurface, mountSurface, type SurfaceDefinition } from "../builder/surface_builder"
import { theme } from "../../config/theme"

type TextSurfaceProps = { title: string; body: string }

export const TextSurfaceDefinition: SurfaceDefinition<TextSurfaceProps> = defineSurface<TextSurfaceProps>({
  id: (props) => `TextSurface.${props.title}`,
  setup: (props) => () => (
    <PanelColumn style={{ padding: theme.spacing.md, gap: theme.spacing.xs }}>
      <Text key="title" size="headline" weight="bold">{props.title}</Text>
      <RichText
        key="body"
        tone="muted"
        style={{ fill: true }}
        spans={[{ text: props.body, color: theme.colors.textMuted }]}
      />
    </PanelColumn>
  ),
})

/** Drop-in replacement: returns a Surface instance like the old `new TextSurface(opts)` */
export function TextSurface(opts: { id: string; title: string; body: string }) {
  return mountSurface(TextSurfaceDefinition, { title: opts.title, body: opts.body })
}
