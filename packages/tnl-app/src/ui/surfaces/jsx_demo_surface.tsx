import { createElement, Fragment } from "@tnl/canvas-interface/jsx"
import { Button, Label, Section, SectionStack, SplitRow, VStack } from "@tnl/canvas-interface/builder/components"
import { defineSurface } from "@tnl/canvas-interface/builder/surface_builder"
import { signal } from "@tnl/canvas-interface/reactivity"
import { theme } from "@tnl/canvas-interface/theme"

export const JsxDemoSurface = defineSurface({
  id: "JsxDemoSurface",
  setup: () => {
    const clicks = signal(0, { debugLabel: "jsx_demo.clicks" })

    return () => (
      <VStack style={{ padding: theme.spacing.md, gap: theme.spacing.md }}>
        <SplitRow
          left={<Label color={theme.colors.text} emphasis={{ bold: true }}>JSX Builder Demo</Label>}
          right={<Label color={theme.colors.textMuted}>{`Clicks: ${clicks.get()}`}</Label>}
        />
        <Section title="Authoring">
          <SectionStack>
            <Label color={theme.colors.textMuted}>This surface exists to validate TSX authoring on top of RenderElement.</Label>
            <Button text="Increment" onClick={() => clicks.set((v) => v + 1)} style={{ fixed: 120 }} />
          </SectionStack>
        </Section>
      </VStack>
    )
  },
})
