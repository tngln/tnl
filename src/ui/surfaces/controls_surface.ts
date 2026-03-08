import { signal } from "../../core/reactivity"
import { theme } from "../../config/theme"
import {
  BuilderSurface,
  buttonNode,
  checkboxNode,
  column,
  formRow,
  radioNode,
  richTextNode,
  spacer,
  textNode,
} from "../builder/surface_builder"

export class ControlsSurface extends BuilderSurface {
  private readonly clicks = signal(0)
  private readonly checked = signal(false)
  private readonly radio = signal("A")

  constructor() {
    const bodyStyle = {
      fontFamily: theme.typography.family,
      fontSize: theme.typography.body.size,
      fontWeight: theme.typography.body.weight,
      lineHeight: theme.spacing.lg,
    }
    const headlineStyle = {
      fontFamily: theme.typography.family,
      fontSize: theme.typography.headline.size,
      fontWeight: theme.typography.headline.weight,
      lineHeight: theme.spacing.lg,
    }

    super({
      id: "ControlsSurface",
      build: () =>
        column(
          [
            richTextNode([{ text: "Developer", color: theme.colors.textPrimary, emphasis: { bold: true } }], {
              key: "controls.title",
              textStyle: headlineStyle,
            }),
            richTextNode(
              [
                { text: "Use this window to test UI controls. ", color: theme.colors.textMuted },
                { text: "Resize", color: theme.colors.textPrimary, emphasis: { underline: true } },
                { text: ", ", color: theme.colors.textMuted },
                { text: "minimize", color: theme.colors.textPrimary, emphasis: { italic: true } },
                { text: ", and click around.", color: theme.colors.textMuted },
              ],
              {
                key: "controls.hint",
                textStyle: bodyStyle,
              },
            ),
            spacer({ fixed: theme.spacing.sm }),
            formRow(
              "Actions",
              buttonNode(`Button (${this.clicks.peek()})`, {
                key: "controls.button",
                style: { fixed: 140 },
                onClick: () => this.clicks.set((v) => v + 1),
              }),
              { key: "controls.actions", labelWidth: 64 },
            ),
            textNode(`Checked: ${this.checked.peek() ? "true" : "false"}, Radio: ${this.radio.peek()}`, {
              key: "controls.status",
              color: theme.colors.textMuted,
              style: { margin: { l: 74, t: theme.spacing.xs, r: 0, b: 0 } },
            }),
            spacer({ fixed: theme.spacing.sm }),
            checkboxNode("Checkbox: enable something", this.checked, { key: "controls.checkbox" }),
            radioNode("Radio A", "A", this.radio, { key: "controls.radio.a" }),
            radioNode("Radio B", "B", this.radio, { key: "controls.radio.b" }),
            spacer({ fixed: theme.spacing.sm }),
            richTextNode(
              [
                { text: "Paragraph: ", color: theme.colors.textMuted },
                { text: "this should wrap automatically", color: theme.colors.textPrimary, emphasis: { bold: true } },
                { text: " when the window is resized narrower. ", color: theme.colors.textMuted },
                { text: "Bold", color: theme.colors.textPrimary, emphasis: { bold: true } },
                { text: "/", color: theme.colors.textMuted },
                { text: "Italic", color: theme.colors.textPrimary, emphasis: { italic: true } },
                { text: "/", color: theme.colors.textMuted },
                { text: "Underline", color: theme.colors.textPrimary, emphasis: { underline: true } },
                { text: " and colors are supported.", color: theme.colors.textMuted },
              ],
              {
                key: "controls.paragraph",
                textStyle: bodyStyle,
                style: { fill: true },
              },
            ),
          ],
          {
            axis: "column",
            padding: theme.spacing.md,
            gap: theme.spacing.xs,
            w: "auto",
            h: "auto",
          },
          {
            box: { fill: "rgba(255,255,255,0.02)", stroke: "rgba(255,255,255,0.10)" },
          },
        ),
    })
  }
}
