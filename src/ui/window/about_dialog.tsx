import { createElement, Fragment } from "../jsx"
import { PanelColumn, RichText, Spacer, Text } from "../builder/components"
import { defineSurface, surfaceMount } from "../builder/surface_builder"
import { theme } from "../../config/theme"
import { type RichTextSpan } from "../../core/draw.text"
import { SurfaceWindow } from "./window"

export const ABOUT_DIALOG_ID = "Help.About"

const AboutBodySurface = defineSurface({
  id: "About.Body",
  setup: () => {
    const copySpans: RichTextSpan[] = [
      { text: "Copyright (c) ", color: theme.colors.textMuted },
      { text: "Tung Leen", color: theme.colors.textPrimary, emphasis: { bold: true } },
      { text: " & ", color: theme.colors.textMuted },
      { text: "tnl contributors", color: theme.colors.textPrimary, emphasis: { underline: true } },
      { text: ". ", color: theme.colors.textMuted },
      { text: "All rights reserved.", color: theme.colors.textMuted, emphasis: { italic: true } },
      { text: " This message is here mostly to fill space.", color: theme.colors.textMuted },
    ]

    return () => (
      <PanelColumn>
        <Text key="about.headline" size="headline" weight="bold">tnl - Tung's Non-Linear Editor</Text>
        <Spacer style={{ fixed: 10 }} />
        <Text key="about.license" tone="muted">MIT License</Text>
        <Spacer style={{ fixed: theme.spacing.xs }} />
        <RichText key="about.copy" spans={copySpans} tone="muted" />
      </PanelColumn>
    )
  },
})

export class AboutDialog extends SurfaceWindow {
  constructor() {
    super({
      id: ABOUT_DIALOG_ID,
      x: 80,
      y: 80,
      w: 480,
      h: 260,
      minW: 320,
      minH: 220,
      title: "About",
      open: true,
      resizable: true,
      body: surfaceMount(AboutBodySurface, {}),
    })
  }
}
