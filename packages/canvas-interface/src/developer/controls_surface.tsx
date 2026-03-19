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

    const loadDraft = () => {
      input.set(`Draft ${clicks.get() + 1}: radio=${radio.get()} dropdown=${dropdown.get()}`)
      clicks.set((v) => v + 1)
    }

    const armDanger = () => {
      checked.set(true)
      palette.set(2)
      input.set("Danger mode armed")
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
                  visualStyle={{
                    base: {
                      layout: { padding: { left: 10, right: 10, top: 6, bottom: 6 }, minH: 32 },
                      paint: { fill: "rgba(233,237,243,0.04)" },
                      border: { color: "rgba(226,232,240,0.08)", radius: 10 },
                      text: { color: "#e9edf3", fontWeight: 600, baseline: "middle" },
                      image: { color: "#e9edf3", width: 14, height: 14 },
                    },
                    hover: { paint: { fill: "rgba(233,237,243,0.08)" } },
                    pressed: { paint: { fill: "rgba(233,237,243,0.12)" } },
                  }}
                  onClick={() => clicks.set((v) => v + 1)}
                />
                <Button
                  key="controls.button.toggle"
                  text={checked.get() ? "Disable Flag" : "Enable Flag"}
                  style={{ fixed: 132 }}
                  leadingIcon={checked.get() ? "!" : "o"}
                  visualStyle={{
                    base: {
                      layout: { padding: { left: 10, right: 10, top: 6, bottom: 6 }, minH: 32 },
                      paint: { fill: checked.get() ? "rgba(70,209,152,0.16)" : "#121825" },
                      border: { color: checked.get() ? "rgba(70,209,152,0.72)" : "rgba(233,237,243,0.24)", radius: 999 },
                      text: { color: checked.get() ? "#f4fffb" : "#e9edf3", baseline: "middle" },
                      image: { color: checked.get() ? "#46d198" : "#e9edf3", width: 14, height: 14 },
                      effects: { shadow: checked.get() ? { color: "rgba(0,0,0,0.24)", blur: 10, offsetY: 3 } : { color: "rgba(0,0,0,0.30)", blur: 6, offsetY: 2 } },
                    },
                    hover: { paint: { fill: checked.get() ? "rgba(70,209,152,0.22)" : "#1a2233" } },
                    pressed: { paint: { fill: checked.get() ? "rgba(70,209,152,0.28)" : "#0f172a" } },
                  }}
                  onClick={() => checked.set((value) => !value)}
                />
                <Button
                  key="controls.button.cycle"
                  text={`Cycle ${dropdown.get()}`}
                  style={{ fixed: 112 }}
                  trailingIcon=">"
                  visualStyle={{
                    base: {
                      layout: { padding: { left: 10, right: 10, top: 6, bottom: 6 }, minH: 32 },
                      paint: {
                        fill: {
                          kind: "linear",
                          x0: 0,
                          y0: 0,
                          x1: 1,
                          y1: 1,
                          stops: [
                            { offset: 0, color: "#61b8ff" },
                            { offset: 1, color: "#3f78ff" },
                          ],
                        },
                      },
                      border: { color: "rgba(59,130,246,0.70)", radius: 14 },
                      text: { color: "#f8fbff", baseline: "middle" },
                      image: { color: "#f8fbff", width: 14, height: 14 },
                      effects: { shadow: { color: "rgba(59,130,246,0.32)", blur: 14, offsetY: 0 } },
                    },
                    hover: { paint: { opacity: 0.94 } },
                    pressed: { paint: { opacity: 0.82 } },
                  }}
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
                  visualStyle={{
                    base: {
                      layout: { padding: { left: palette.get() === 2 ? 12 : 8, right: palette.get() === 2 ? 12 : 8, top: palette.get() === 2 ? 6 : 4, bottom: palette.get() === 2 ? 6 : 4 }, minH: 28 },
                      paint: { fill: palette.get() === 0 ? "#1e293b" : palette.get() === 1 ? "rgba(255,196,92,0.16)" : "#e81123" },
                      border: { color: palette.get() === 0 ? "rgba(226,232,240,0.08)" : palette.get() === 1 ? "rgba(255,196,92,0.70)" : "rgba(255,120,120,0.72)", radius: palette.get() === 2 ? 999 : palette.get() === 1 ? 6 : 10 },
                      text: { color: palette.get() === 0 ? "#e9edf3" : palette.get() === 1 ? "#ffc45c" : "#fff5f5", baseline: "middle" },
                      image: { color: palette.get() === 0 ? "#e9edf3" : palette.get() === 1 ? "#ffc45c" : "#fff5f5", width: 12, height: 12 },
                      effects: { shadow: palette.get() === 0 ? { color: "rgba(0,0,0,0.24)", blur: 10, offsetY: 3 } : palette.get() === 2 ? { color: "rgba(255,120,120,0.28)", blur: 14, offsetY: 0 } : undefined },
                    },
                  }}
                  onClick={applyPreset}
                />
                <Button
                  key="controls.button.fill"
                  text="Fill Input"
                  style={{ fixed: 96 }}
                  leadingIcon=">"
                  visualStyle={{
                    base: {
                      layout: { padding: { left: 8, right: 8, top: 4, bottom: 4 }, minH: 28 },
                      paint: { fill: "rgba(59,130,246,0.18)" },
                      border: { color: null, radius: 10 },
                      text: { color: "#3b82f6", baseline: "middle" },
                      image: { color: "#3b82f6", width: 14, height: 14 },
                    },
                    hover: { paint: { fill: "rgba(59,130,246,0.26)" } },
                    pressed: { paint: { fill: "rgba(59,130,246,0.34)" } },
                  }}
                  onClick={() => input.set(`Clicks ${clicks.get()} / ${dropdown.get()}`)}
                />
                <Button
                  key="controls.button.clear"
                  text="Clear"
                  style={{ fixed: 80 }}
                  trailingIcon="x"
                  visualStyle={{
                    base: {
                      layout: { padding: { left: 6, right: 6, top: 2, bottom: 2 }, minH: 24 },
                      paint: { fill: "rgba(255,120,120,0.16)" },
                      border: { color: "rgba(255,120,120,0.70)", radius: 999 },
                      text: { color: "rgba(255,120,120,0.95)", baseline: "middle" },
                      image: { color: "rgba(255,120,120,0.95)", width: 12, height: 12 },
                    },
                    hover: { paint: { fill: "rgba(255,120,120,0.22)" } },
                    pressed: { paint: { fill: "rgba(255,120,120,0.28)" } },
                  }}
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
        <PanelSection title="Visual Style">
          <Text key="controls.visual.note" tone="muted">
            These buttons use `visualStyle` directly, so each one is showing the new primitive/style model on purpose.
          </Text>
          <Row style={{ gap: 8, margin: { t: 6, l: 0, r: 0, b: 0 } }}>
            <Button
              key="controls.visual.accent"
              text={`Launch ${clicks.get()}`}
              title="Structured style with accent fill, custom image tint, and state variants."
              leadingIcon=">"
              style={{ fixed: 136 }}
              visualStyle={{
                base: {
                  layout: { padding: { left: 12, right: 12, top: 8, bottom: 8 }, minH: 36 },
                  paint: {
                    fill: {
                      kind: "linear",
                      x0: 0,
                      y0: 0,
                      x1: 1,
                      y1: 1,
                      stops: [
                        { offset: 0, color: "#79c3ff" },
                        { offset: 1, color: "#2563eb" },
                      ],
                    },
                  },
                  border: { color: "rgba(140,190,255,0.60)", radius: 14 },
                  text: { color: "#f8fbff", fontWeight: 600, baseline: "middle", align: "center" },
                  image: { color: "#f8fbff", width: 16, height: 16 },
                  effects: { shadow: { color: "rgba(37,99,235,0.30)", blur: 14, offsetY: 0 } },
                },
                hover: { paint: { opacity: 0.94 } },
                pressed: { paint: { opacity: 0.82 } },
              }}
              onClick={() => clicks.set((v) => v + 1)}
            />
            <Button
              key="controls.visual.ghost"
              text={checked.get() ? "Flag On" : "Flag Off"}
              title="Ghost button with outline emphasis and pill shape."
              trailingIcon={checked.get() ? "!" : "o"}
              style={{ fixed: 124 }}
              visualStyle={{
                base: {
                  layout: { padding: { left: 12, right: 12, top: 4, bottom: 4 }, minH: 28 },
                  paint: { fill: "transparent" },
                  border: { color: checked.get() ? "rgba(70,209,152,0.72)" : "rgba(233,237,243,0.24)", radius: 999 },
                  text: { color: checked.get() ? "#f4fffb" : "#e9edf3", fontWeight: 500, baseline: "middle" },
                  image: { color: checked.get() ? "#46d198" : "rgba(233,237,243,0.60)", width: 14, height: 14 },
                },
                hover: { paint: { fill: checked.get() ? "rgba(70,209,152,0.14)" : "rgba(233,237,243,0.06)" } },
                pressed: { paint: { fill: checked.get() ? "rgba(70,209,152,0.22)" : "rgba(233,237,243,0.10)" } },
              }}
              onClick={() => checked.set((value) => !value)}
            />
            <Button
              key="controls.visual.load"
              text="Load Draft"
              title="Dense utility button with inset panel styling."
              leadingIcon="*"
              style={{ fixed: 108 }}
              visualStyle={{
                base: {
                  layout: { padding: { left: 8, right: 8, top: 3, bottom: 3 }, minH: 26 },
                  paint: { fill: "#121825" },
                  border: { color: "rgba(233,237,243,0.10)", radius: 6 },
                  text: { color: "rgba(233,237,243,0.85)", fontSize: 11, fontWeight: 500, baseline: "middle" },
                  image: { color: "#94a3b8", width: 12, height: 12 },
                  effects: { shadow: { color: "rgba(0,0,0,0.20)", blur: 6, offsetY: 2 } },
                },
                hover: { border: { color: "rgba(233,237,243,0.22)" }, paint: { fill: "#1a2233" } },
                pressed: { paint: { fill: "#0f172a" } },
              }}
              onClick={loadDraft}
            />
          </Row>
          <Row style={{ gap: 8, margin: { t: 8, l: 0, r: 0, b: 0 } }}>
            <Button
              key="controls.visual.cycle"
              text={`Cycle ${dropdown.get()}`}
              title="Compact square button emphasizing border, not fill."
              trailingIcon=">"
              style={{ fixed: 108 }}
              visualStyle={{
                base: {
                  layout: { padding: { left: 8, right: 8, top: 8, bottom: 8 }, minH: 34 },
                  paint: { fill: "#0b0f17" },
                  border: { color: "rgba(255,196,92,0.55)", radius: 8 },
                  text: { color: "#ffc45c", fontWeight: 600, baseline: "middle" },
                  image: { color: "#ffc45c", width: 14, height: 14 },
                },
                hover: { paint: { fill: "rgba(255,196,92,0.10)" } },
                pressed: { paint: { fill: "rgba(255,196,92,0.18)" } },
              }}
              onClick={cycleChoice}
            />
            <Button
              key="controls.visual.arm"
              text="Arm Danger"
              title="Danger action with solid fill and aggressive shadow."
              leadingIcon="!"
              style={{ fixed: 120 }}
              visualStyle={{
                base: {
                  layout: { padding: { left: 12, right: 12, top: 7, bottom: 7 }, minH: 34 },
                  paint: { fill: "#e81123" },
                  border: { color: "rgba(255,120,120,0.72)", radius: 999 },
                  text: { color: "#fff5f5", fontWeight: 700, baseline: "middle" },
                  image: { color: "#fff5f5", width: 16, height: 16 },
                  effects: { shadow: { color: "rgba(232,17,35,0.30)", blur: 14, offsetY: 0 } },
                },
                hover: { paint: { fill: "#ff3040" } },
                pressed: { paint: { fill: "#b32020" } },
              }}
              onClick={armDanger}
            />
            <Button
              key="controls.visual.clear"
              text="Clear"
              title="Minimal pill using only border + state overlays."
              trailingIcon="x"
              style={{ fixed: 88 }}
              visualStyle={{
                base: {
                  layout: { padding: { left: 10, right: 10, top: 4, bottom: 4 }, minH: 28 },
                  paint: { fill: "transparent" },
                  border: { color: "rgba(255,120,120,0.56)", radius: 999 },
                  text: { color: "rgba(255,120,120,0.95)", fontWeight: 600, baseline: "middle" },
                  image: { color: "rgba(255,120,120,0.95)", width: 12, height: 12 },
                },
                hover: { paint: { fill: "rgba(255,120,120,0.10)" } },
                pressed: { paint: { fill: "rgba(255,120,120,0.18)" } },
              }}
              onClick={() => input.set("")}
            />
          </Row>
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
