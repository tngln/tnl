import { createElement, Fragment } from "../jsx"
import { Button, Checkbox, Dropdown, FormRow, PanelColumn, PanelSection, Radio, RichText, Spacer, Text, TextBox } from "../builder/components"
import { defineSurface } from "../builder/surface_builder"
import { signal } from "../../core/reactivity"

export const ControlsSurface = defineSurface({
  id: "ControlsSurface",
  setup: (props: { debugLabelPrefix: string }) => {
    const p = (name: string) => `${props.debugLabelPrefix}.${name}`
    const clicks = signal(0, { debugLabel: p("clicks") })
    const checked = signal(false, { debugLabel: p("checked") })
    const radio = signal("A", { debugLabel: p("radio") })
    const input = signal("", { debugLabel: p("input") })
    const dropdown = signal("A", { debugLabel: p("dropdown") })

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
              <Button key="controls.button" text={`Button (${clicks.get()})`} style={{ fixed: 140 }} onClick={() => clicks.set((v) => v + 1)} />
            }
          />
          <Text key="controls.status" tone="muted" style={{ margin: { l: 74, t: 4, r: 0, b: 0 } }}>
            {`Checked: ${checked.get() ? "true" : "false"}, Radio: ${radio.get()}, Dropdown: ${dropdown.get()}, Input: ${input.get() || "(empty)"}`}
          </Text>
          <FormRow
            key="controls.input"
            label="Input"
            labelWidth={64}
            field={<TextBox key="controls.input.box" value={input} placeholder="Type here" style={{ fill: true }} />}
          />
          <FormRow
            key="controls.label"
            label="Label"
            labelWidth={64}
            field={<Text key="controls.input.label">{input.get() || "(empty)"}</Text>}
          />
          <FormRow
            key="controls.dropdown"
            label="Dropdown"
            labelWidth={64}
            field={
              <Dropdown
                key="controls.dropdown.field"
                style={{ fixed: 220 }}
                selected={dropdown}
                options={[
                  { value: "A", label: "Option A" },
                  { value: "B", label: "Option B" },
                  { value: "C", label: "Option C" },
                ]}
              />
            }
          />
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
