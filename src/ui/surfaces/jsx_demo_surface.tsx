import { createElement, Fragment } from "../jsx"
import { Button, Section, Spacer, Text, ToolbarRow, VStack } from "../builder/components"
import { defineSurface } from "../builder/surface_builder"
import { signal } from "../../core/reactivity"
import { theme } from "../../config/theme"

export const JsxDemoSurface = defineSurface({
  id: "JsxDemoSurface",
  setup: () => {
    const clicks = signal(0, { debugLabel: "jsx_demo.clicks" })

    return () => (
      <VStack style={{ padding: theme.spacing.md, gap: theme.spacing.md }}>
        <ToolbarRow>
          <Text color={theme.colors.text} emphasis={{ bold: true }}>JSX Builder Demo</Text>
          <Spacer style={{ fill: true }} />
          <Text color={theme.colors.textMuted}>{`Clicks: ${clicks.get()}`}</Text>
        </ToolbarRow>
        <Section title="Authoring">
          <Text color={theme.colors.textMuted}>This surface exists to validate TSX authoring on top of BuilderNode.</Text>
          <Spacer style={{ fixed: theme.spacing.sm }} />
          <Button text="Increment" onClick={() => clicks.set((v) => v + 1)} style={{ fixed: 120 }} />
        </Section>
      </VStack>
    )
  },
})
