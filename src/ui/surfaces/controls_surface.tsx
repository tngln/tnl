import { createElement, Fragment } from "../jsx"
import { Button, Checkbox, FormRow, PanelColumn, PanelSection, Radio, RichText, Spacer, Text } from "../builder/components"
import { defineSurface } from "../builder/surface_builder"
import { signal } from "../../core/reactivity"

export const ControlsSurface = defineSurface({
  id: "ControlsSurface",
  setup: () => {
    const clicks = signal(0)
    const checked = signal(false)
    const radio = signal("A")

    return () => (
      <PanelColumn>
        <Text key="controls.title" size="headline" weight="bold">Developer</Text>
        <RichText
          key="controls.hint"
          tone="muted"
        >
          Use this window to test UI controls. <u>Resize</u>, <i>minimize</i>, and click around.
        </RichText>
        <PanelSection title="Controls">
          <FormRow
            key="controls.actions"
            label="Actions"
            labelWidth={64}
            field={
              <Button key="controls.button" text={`Button (${clicks.peek()})`} style={{ fixed: 140 }} onClick={() => clicks.set((v) => v + 1)} />
            }
          />
          <Text key="controls.status" tone="muted" style={{ margin: { l: 74, t: 4, r: 0, b: 0 } }}>
            {`Checked: ${checked.peek() ? "true" : "false"}, Radio: ${radio.peek()}`}
          </Text>
          <Spacer style={{ fixed: 6 }} />
          <Checkbox key="controls.checkbox" checked={checked}>Checkbox: enable something</Checkbox>
          <Radio key="controls.radio.a" value="A" selected={radio}>Radio A</Radio>
          <Radio key="controls.radio.b" value="B" selected={radio}>Radio B</Radio>
        </PanelSection>
        <PanelSection title="Typography">
          <RichText
            key="controls.paragraph"
            style={{ fill: true }}
            tone="muted"
          >
            Paragraph: <b>this should wrap automatically</b> when the window is resized narrower. <b>Bold</b>/<i>Italic</i>/<u>Underline</u> and colors are supported.
          </RichText>
        </PanelSection>
      </PanelColumn>
    )
  },
})
