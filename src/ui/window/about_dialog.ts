import { theme } from "../../config/theme"
import { type RichTextSpan } from "../../core/draw.text"
import { BuilderTreeSurface, column, richTextNode, spacer, textNode } from "../builder/surface_builder"
import { ModalWindow } from "./window"

export const ABOUT_DIALOG_ID = "Help.About"

export class AboutDialog extends ModalWindow {
  private readonly bodySurface = new BuilderTreeSurface("About.Body")

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
    })
  }

  protected drawBody(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
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

    this.bodySurface.setNode(
      column(
        [
          richTextNode([{ text: "tnl - Tung's Non-Linear Editor", color: theme.colors.textPrimary, emphasis: { bold: true } }], {
            key: "about.headline",
            textStyle: headlineStyle,
          }),
          spacer({ fixed: theme.spacing.sm }),
          textNode("MIT License", { key: "about.license", color: theme.colors.textMuted }),
          spacer({ fixed: theme.spacing.xs }),
          richTextNode(copySpans, {
            key: "about.copy",
            textStyle: copyStyle,
          }),
        ],
        {
          axis: "column",
          padding: theme.spacing.md,
          gap: 0,
          w: "auto",
          h: "auto",
        },
      ),
    )

    ctx.save()
    ctx.translate(x, y)
    this.bodySurface.render(ctx, {
      rect: { x: 0, y: 0, w, h },
      contentRect: { x: 0, y: 0, w, h },
      clip: false,
      scroll: { x: 0, y: 0 },
      toSurface: (p) => p,
      dpr: 1,
    })
    ctx.restore()
  }
}
