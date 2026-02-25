import { ModalWindow } from "./window"
import { draw, Text } from "../../core/draw"
import { createRichTextBlock, measureTextLine } from "../../core/draw.text"
import { font, theme } from "../../config/theme"
import { layout, type LayoutNode } from "../../core/layout"

export const ABOUT_WINDOW_ID = "Help.About"

export class AboutWindow extends ModalWindow {
  constructor() {
    super({
      id: ABOUT_WINDOW_ID,
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
    const headlineText = "tnl - Tung's Non-Linear Editor"
    const mitText = "MIT License"
    const headlineFont = font(theme, theme.typography.headline)
    const bodyFont = font(theme, theme.typography.body)
    const lh = theme.spacing.lg

    const copyStyle = {
      fontFamily: theme.typography.family,
      fontSize: theme.typography.body.size,
      fontWeight: theme.typography.body.weight,
      lineHeight: lh,
    }
    const copySpans = [
      { text: "Copyright (c) ", color: theme.colors.textMuted },
      { text: "Tung Leen", color: theme.colors.textPrimary, emphasis: { bold: true } },
      { text: " & ", color: theme.colors.textMuted },
      { text: "tnl contributors", color: theme.colors.textPrimary, emphasis: { underline: true } },
      { text: ". ", color: theme.colors.textMuted },
      { text: "All rights reserved.", color: theme.colors.textMuted, emphasis: { italic: true } },
      { text: " This message is here mostly to fill space.", color: theme.colors.textMuted },
    ] as const
    const copyBlock = createRichTextBlock([...copySpans], copyStyle, { align: "start", wrap: "word" })

    const items: {
      id: string
      node: LayoutNode
      draw?: (ctx: CanvasRenderingContext2D, rect: { x: number; y: number; w: number; h: number }) => void
    }[] = [
      {
        id: "headline",
        node: {
          id: "headline",
          measure: (max) => {
            const m = measureTextLine(ctx, headlineText, headlineFont, lh)
            return { w: Math.min(m.w, max.w), h: m.h }
          },
        },
        draw: (ctx, r) =>
          draw(
            ctx,
            Text({
              x: r.x,
              y: r.y,
              text: headlineText,
              style: { color: theme.colors.textPrimary, font: headlineFont, baseline: "top" },
            }),
          ),
      },
      { id: "spacer", node: { id: "spacer", style: { basis: theme.spacing.sm }, measure: () => ({ w: 0, h: theme.spacing.sm }) } },
      {
        id: "mit",
        node: {
          id: "mit",
          measure: (max) => {
            const m = measureTextLine(ctx, mitText, bodyFont, lh)
            return { w: Math.min(m.w, max.w), h: m.h }
          },
        },
        draw: (ctx, r) =>
          draw(
            ctx,
            Text({
              x: r.x,
              y: r.y,
              text: mitText,
              style: { color: theme.colors.textMuted, font: bodyFont, baseline: "top" },
            }),
          ),
      },
      { id: "spacer2", node: { id: "spacer2", style: { basis: theme.spacing.xs }, measure: () => ({ w: 0, h: theme.spacing.xs }) } },
      {
        id: "copy",
        node: {
          id: "copy",
          measure: (max) => {
            const m = copyBlock.measure(ctx, max.w)
            return { w: max.w, h: m.h }
          },
        },
        draw: (_ctx, r) => copyBlock.draw(ctx, { x: r.x, y: r.y }),
      },
    ]

    const root: LayoutNode = {
      style: { axis: "column", padding: theme.spacing.md, gap: 0, align: "start" },
      children: items.map((it) => it.node),
    }

    layout(root, { x, y, w, h })
    for (const it of items) {
      const r = it.node.rect
      if (!r || !it.draw) continue
      it.draw(ctx, r)
    }
  }
}

