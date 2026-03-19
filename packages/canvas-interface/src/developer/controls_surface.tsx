import { createElement, Fragment } from "../jsx"
import { Button, Checkbox, Dropdown, FormRow, PanelColumn, PanelSection, Radio, RichText, Row, Spacer, Text, TextBox, defineSurface } from "../builder"
import { signal } from "../reactivity"

export const ControlsSurface = defineSurface({
  id: "ControlsSurface",
  setup: (props: { debugLabelPrefix: string }) => {
    const p = (name: string) => `${props.debugLabelPrefix}.${name}`
    const clicks = signal(0, { debugLabel: p("clicks") })
    const checked = signal(false, { debugLabel: p("checked") })
    const radio = signal("A", { debugLabel: p("radio") })
    const input = signal("", { debugLabel: p("input") })
    const dropdown = signal("A", { debugLabel: p("dropdown") })
    const palette = signal(0, { debugLabel: p("palette") })

    const cycleChoice = () => {
      const order = ["A", "B", "C"] as const
      const current = dropdown.get()
      const index = order.indexOf((current === "A" || current === "B" || current === "C") ? current : "A")
      const next = order[(index + 1) % order.length]!
      dropdown.set(next)
      radio.set(next === "C" ? "B" : next)
    }

    const applyPreset = () => {
      const next = (palette.get() + 1) % 3
      palette.set(next)
      if (next === 0) {
        input.set("Preset: calm panel")
        checked.set(false)
      } else if (next === 1) {
        input.set("Preset: compact shadow")
        checked.set(true)
      } else {
        input.set("Preset: loud capsule")
        checked.set(!checked.get())
      }
    }

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
              <Row style={{ gap: 8 }}>
                <Button
                  key="controls.button.count"
                  text={`Count (${clicks.get()})`}
                  style={{ fixed: 140 }}
                  leadingIcon="+"
                  appearance={["bg-subtle", "stroke-subtle", "rounded-md", "px-10", "py-6", "text-strong"]}
                  onClick={() => clicks.set((v) => v + 1)}
                />
                <Button
                  key="controls.button.toggle"
                  text={checked.get() ? "Disable Flag" : "Enable Flag"}
                  style={{ fixed: 132 }}
                  leadingIcon={checked.get() ? "!" : "o"}
                  appearance={checked.get()
                    ? ["bg-success-soft", "stroke-success", "shadow-soft", "rounded-full", "px-10", "py-6", "text-on-success"]
                    : ["bg-panel-inset", "stroke-strong", "shadow-tight", "rounded-full", "px-10", "py-6", "text-strong"]}
                  onClick={() => checked.set((value) => !value)}
                />
                <Button
                  key="controls.button.cycle"
                  text={`Cycle ${dropdown.get()}`}
                  style={{ fixed: 112 }}
                  trailingIcon=">"
                  appearance={["bg-accent-gradient", "stroke-accent", "shadow-glow-accent", "rounded-lg", "px-10", "py-6", "text-on-accent"]}
                  onClick={cycleChoice}
                />
              </Row>
            }
          />
          <FormRow
            key="controls.presets"
            label="Presets"
            labelWidth={64}
            field={
              <Row style={{ gap: 8 }}>
                <Button
                  key="controls.button.preset"
                  text={`Preset ${palette.get() + 1}`}
                  style={{ fixed: 104 }}
                  leadingIcon="*"
                  appearance={
                    palette.get() === 0
                      ? ["bg-panel", "stroke-subtle", "shadow-soft", "rounded-md", "px-8", "py-4", "text-strong"]
                      : palette.get() === 1
                        ? ["bg-warning-soft", "stroke-warning", "rounded-sm", "px-8", "py-4", "text-warning"]
                        : ["bg-danger-solid", "stroke-danger", "shadow-glow-danger", "rounded-full", "px-12", "py-6", "text-on-danger"]
                  }
                  onClick={applyPreset}
                />
                <Button
                  key="controls.button.fill"
                  text="Fill Input"
                  style={{ fixed: 96 }}
                  leadingIcon=">"
                  appearance={["bg-accent-soft", "stroke-none", "rounded-md", "px-8", "py-4", "text-accent"]}
                  onClick={() => input.set(`Clicks ${clicks.get()} / ${dropdown.get()}`)}
                />
                <Button
                  key="controls.button.clear"
                  text="Clear"
                  style={{ fixed: 80 }}
                  trailingIcon="x"
                  appearance={["bg-danger-soft", "stroke-danger", "rounded-full", "px-6", "py-2", "text-danger"]}
                  onClick={() => input.set("")}
                />
              </Row>
            }
          />
          <Text key="controls.status" tone="muted" style={{ margin: { l: 74, t: 4, r: 0, b: 0 } }}>
            {`Checked: ${checked.get() ? "true" : "false"}, Radio: ${radio.get()}, Dropdown: ${dropdown.get()}, Input: ${input.get() || "(empty)"}, Preset: ${palette.get() + 1}`}
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
