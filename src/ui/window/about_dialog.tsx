import { createElement, Fragment } from "../jsx"
import { Column, RichText, Spacer, Text } from "../builder/components"
import { defineSurface, surfaceMount } from "../builder/surface_builder"
import { theme } from "../../config/theme"
import { type RichTextSpan } from "../../core/draw.text"
import { SurfaceWindow } from "./window"

export const ABOUT_DIALOG_ID = "Help.About"

const AboutBodySurface = defineSurface({
  id: "About.Body",
  setup: () => {
    const copyStyle = {
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
      <Column style={{ axis: "column", padding: theme.spacing.md, gap: 0, w: "auto", h: "auto" }}>
        <RichText
          key="about.headline"
          spans={[{ text: "tnl - Tung's Non-Linear Editor", color: theme.colors.textPrimary, emphasis: { bold: true } }]}
          textStyle={headlineStyle}
        />
        <Spacer style={{ fixed: theme.spacing.sm }} />
        <Text key="about.license" color={theme.colors.textMuted}>MIT License</Text>
        <Spacer style={{ fixed: theme.spacing.xs }} />
        <RichText key="about.copy" spans={copySpans} textStyle={copyStyle} />
      </Column>
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
