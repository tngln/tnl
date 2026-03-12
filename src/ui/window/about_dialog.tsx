import { createElement, Fragment } from "../jsx"
import { PanelColumn, RichText, Spacer, Text } from "../builder/components"
import { defineSurface, surfaceMount } from "../builder/surface_builder"
import { theme } from "../../config/theme"
import { SurfaceWindow } from "./window"

export const ABOUT_DIALOG_ID = "Help.About"

const AboutBodySurface = defineSurface({
  id: "About.Body",
  setup: () => () => (
      <PanelColumn>
        <Text key="about.headline" size="headline" weight="bold">tnl - Tung's Non-Linear Editor</Text>
        <Spacer style={{ fixed: 10 }} />
        <Text key="about.license" tone="muted">MIT License</Text>
        <Spacer style={{ fixed: theme.spacing.xs }} />
        <RichText key="about.copy" tone="muted" selectable>
          Copyright (c) <b>Tung Leen</b> & <u>tnl contributors</u>. <i>All rights reserved.</i> This message is here mostly to fill space.
        </RichText>
      </PanelColumn>
    ),
})

export function createAboutDialog() {
  return new SurfaceWindow({
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
