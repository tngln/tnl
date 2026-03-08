import { createElement, Fragment } from "../jsx"
import { Button, Checkbox, FormRow, PanelColumn, PanelSection, Radio, RichText, Spacer, Text } from "../builder/components"
import { defineSurface } from "../builder/surface_builder"
import { signal } from "../../core/reactivity"
import { theme } from "../../config/theme"

export const ControlsSurface = defineSurface({
  id: "ControlsSurface",
  setup: () => {
    const clicks = signal(0)
    const checked = signal(false)
    const radio = signal("A")

    return () => (
      <PanelColumn style={{ padding: theme.spacing.md, gap: theme.spacing.xs }}>
        <Text key="controls.title" size="headline" weight="bold">Developer</Text>
        <RichText
          key="controls.hint"
          tone="muted"
          spans={[
            { text: "Use this window to test UI controls. ", color: theme.colors.textMuted },
            { text: "Resize", color: theme.colors.textPrimary, emphasis: { underline: true } },
            { text: ", ", color: theme.colors.textMuted },
            { text: "minimize", color: theme.colors.textPrimary, emphasis: { italic: true } },
            { text: ", and click around.", color: theme.colors.textMuted },
          ]}
        />
        <PanelSection title="Controls">
          <FormRow
            key="controls.actions"
            label="Actions"
            labelWidth={64}
            field={
              <Button key="controls.button" text={`Button (${clicks.peek()})`} style={{ fixed: 140 }} onClick={() => clicks.set((v) => v + 1)} />
            }
          />
          <Text key="controls.status" tone="muted" style={{ margin: { l: 74, t: theme.spacing.xs, r: 0, b: 0 } }}>
            {`Checked: ${checked.peek() ? "true" : "false"}, Radio: ${radio.peek()}`}
          </Text>
          <Spacer style={{ fixed: theme.spacing.sm }} />
          <Checkbox key="controls.checkbox" checked={checked}>Checkbox: enable something</Checkbox>
          <Radio key="controls.radio.a" value="A" selected={radio}>Radio A</Radio>
          <Radio key="controls.radio.b" value="B" selected={radio}>Radio B</Radio>
        </PanelSection>
        <PanelSection title="Typography">
          <RichText
            key="controls.paragraph"
            style={{ fill: true }}
            tone="muted"
            spans={[
              { text: "Paragraph: ", color: theme.colors.textMuted },
              { text: "this should wrap automatically", color: theme.colors.textPrimary, emphasis: { bold: true } },
              { text: " when the window is resized narrower. ", color: theme.colors.textMuted },
              { text: "Bold", color: theme.colors.textPrimary, emphasis: { bold: true } },
              { text: "/", color: theme.colors.textMuted },
              { text: "Italic", color: theme.colors.textPrimary, emphasis: { italic: true } },
              { text: "/", color: theme.colors.textMuted },
              { text: "Underline", color: theme.colors.textPrimary, emphasis: { underline: true } },
              { text: " and colors are supported.", color: theme.colors.textMuted },
            ]}
          />
        </PanelSection>
      </PanelColumn>
    )
  },
})
