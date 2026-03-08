import { createElement, Fragment } from "../../../jsx"
import { Column, RichText, ScrollArea, Section, Spacer, Text, ToolbarRow } from "../../../builder/components"
import { defineSurface, mountSurface } from "../../../builder/surface_builder"
import { theme } from "../../../../config/theme"
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
    setup: () => {
      const bodyStyle = {
        fontFamily: theme.typography.family,
        fontSize: theme.typography.body.size,
        fontWeight: theme.typography.body.weight,
        lineHeight: theme.spacing.lg,
      }

      return () => (
        <Column style={{ axis: "column", padding: theme.spacing.sm, gap: theme.spacing.sm, w: "auto", h: "auto" }}>
          <ToolbarRow key={`${spec.id}.toolbar`}>
            <Text key={`${spec.id}.title`} color={theme.colors.textPrimary} emphasis={{ bold: true }}>{spec.heading}</Text>
            <Spacer style={{ fill: true }} />
            <Text key={`${spec.id}.meta`} color={theme.colors.textMuted}>Builder Panel</Text>
          </ToolbarRow>
          <ScrollArea key={`${spec.id}.scroll`} style={{ fill: true }} box={{ fill: "rgba(255,255,255,0.01)" }}>
            <Column style={{ axis: "column", padding: theme.spacing.xs, gap: theme.spacing.sm, w: "auto", h: "auto" }}>
              <Section title="Status" key={`${spec.id}.status`}>
                <RichText
                  key={`${spec.id}.summary`}
                  spans={[{ text: spec.summary, color: theme.colors.textMuted }]}
                  textStyle={bodyStyle}
                />
              </Section>
              {spec.notes && spec.notes.length > 0 ? (
                <Section title="Next" key={`${spec.id}.next`}>
                  <Column style={{ axis: "column", gap: theme.spacing.xs, w: "auto", h: "auto" }}>
                    {spec.notes.map((note, index) => (
                      <RichText
                        key={`${spec.id}.note.${index}`}
                        spans={[
                          { text: `${index + 1}. `, color: theme.colors.textPrimary, emphasis: { bold: true } },
                          { text: note, color: theme.colors.textMuted },
                        ]}
                        textStyle={bodyStyle}
                      />
                    ))}
                  </Column>
                </Section>
              ) : null}
            </Column>
          </ScrollArea>
        </Column>
      )
    },
  })

  return {
    id: spec.id,
    title: spec.title,
    build: () => mountSurface(Surface, {}),
  }
}
