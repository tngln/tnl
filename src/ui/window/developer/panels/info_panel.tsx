import { createElement } from "../../../jsx"
import { Column, PanelColumn, PanelScroll, PanelSection, PanelToolbar, RichText, Spacer, Text } from "../../../builder/components"
import { defineSurface, mountSurface } from "../../../builder/surface_builder"
import type { DeveloperPanelSpec } from "../index"

type InfoPanelSpec = {
  id: string
  title: string
  heading: string
  summary: string
  notes?: string[]
}

export function createInfoPanel(spec: InfoPanelSpec): DeveloperPanelSpec {
  const Surface = defineSurface({
    id: `${spec.id}.Surface`,
    setup: () => () => (
      <PanelColumn>
        <PanelToolbar key={`${spec.id}.toolbar`}>
          <Text key={`${spec.id}.title`} weight="bold">{spec.heading}</Text>
          <Spacer style={{ fill: true }} />
          <Text key={`${spec.id}.meta`} tone="muted" size="meta">Builder Panel</Text>
        </PanelToolbar>
        <PanelScroll key={`${spec.id}.scroll`}>
          <Column style={{ axis: "column", padding: 6, gap: 10, w: "auto", h: "auto" }}>
              <PanelSection title="Status" key={`${spec.id}.status`}>
                <RichText key={`${spec.id}.summary`} tone="muted">{spec.summary}</RichText>
              </PanelSection>
            {spec.notes && spec.notes.length > 0 ? (
              <PanelSection title="Next" key={`${spec.id}.next`}>
                <Column style={{ axis: "column", gap: 6, w: "auto", h: "auto" }}>
                  {spec.notes.map((note, index) => (
                    <RichText
                      key={`${spec.id}.note.${index}`}
                      tone="muted"
                    >
                      <b>{`${index + 1}. `}</b>{note}
                    </RichText>
                  ))}
                </Column>
              </PanelSection>
            ) : null}
          </Column>
        </PanelScroll>
      </PanelColumn>
    ),
  })

  return {
    id: spec.id,
    title: spec.title,
    build: () => mountSurface(Surface, {}),
  }
}
