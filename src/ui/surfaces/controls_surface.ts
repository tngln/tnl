import { Compositor } from "../base/compositor"
import { signal } from "../../core/reactivity"
import { theme } from "../../config/theme"
import { UIElement, type Rect, type Vec2 } from "../base/ui"
import { Button, Checkbox, Label, Paragraph, Radio } from "../widgets"
import type { Surface, ViewportContext } from "../base/viewport"

class SurfaceRoot extends UIElement {
  bounds(): Rect {
    return { x: -1e9, y: -1e9, w: 2e9, h: 2e9 }
  }
}

export class ControlsSurface implements Surface {
  readonly id = "ControlsSurface"
  private readonly root = new SurfaceRoot()
  private size: Vec2 = { x: 0, y: 0 }

  private readonly clicks = signal(0)
  private readonly checked = signal(false)
  private readonly radio = signal("A")

  constructor() {
    const pad = theme.spacing.md
    const lh = theme.spacing.lg

    const content = () => ({
      x: 0,
      y: 0,
      w: Math.max(0, this.size.x),
      h: Math.max(0, this.size.y),
    })

    const titleStyle = {
      fontFamily: theme.typography.family,
      fontSize: theme.typography.headline.size,
      fontWeight: theme.typography.headline.weight,
      lineHeight: lh,
    }
    const bodyStyle = {
      fontFamily: theme.typography.family,
      fontSize: theme.typography.body.size,
      fontWeight: theme.typography.body.weight,
      lineHeight: lh,
    }

    const y0 = () => content().y + pad
    const y1 = () => y0() + lh + theme.spacing.xs
    const y2 = () => y1() + lh * 2 + theme.spacing.sm
    const y3 = () => y2() + 34 + theme.spacing.sm
    const y4 = () => y3() + 26 + theme.spacing.xs
    const y5 = () => y4() + 26 + theme.spacing.xs
    const y6 = () => y5() + 26 + theme.spacing.sm

    const x0 = () => content().x + pad
    const w0 = () => Math.max(0, content().w - pad * 2)

    const title = new Paragraph({
      rect: () => ({ x: x0(), y: y0(), w: w0(), h: lh }),
      spans: [{ text: "Developer", color: theme.colors.textPrimary, emphasis: { bold: true } }],
      style: titleStyle,
    })

    const hint = new Paragraph({
      rect: () => ({ x: x0(), y: y1(), w: w0(), h: lh * 2 }),
      spans: [
        { text: "Use this window to test UI controls. ", color: theme.colors.textMuted },
        { text: "Resize", color: theme.colors.textPrimary, emphasis: { underline: true } },
        { text: ", ", color: theme.colors.textMuted },
        { text: "minimize", color: theme.colors.textPrimary, emphasis: { italic: true } },
        { text: ", and click around.", color: theme.colors.textMuted },
      ],
      style: bodyStyle,
    })

    const button = new Button({
      rect: () => ({ x: x0(), y: y2(), w: 140, h: 32 }),
      text: () => `Button (${this.clicks.peek()})`,
      onClick: () => this.clicks.set((v) => v + 1),
    })
    button.z = 10

    const status = new Label({
      rect: () => ({ x: x0() + 160, y: y2() + 7, w: Math.max(0, w0() - 160), h: lh }),
      text: () => `Checked: ${this.checked.peek() ? "true" : "false"}, Radio: ${this.radio.peek()}`,
      color: theme.colors.textMuted,
    })

    const checkbox = new Checkbox({
      rect: () => ({ x: x0(), y: y3(), w: w0(), h: 24 }),
      label: "Checkbox: enable something",
      checked: this.checked,
    })
    checkbox.z = 10

    const radioA = new Radio({
      rect: () => ({ x: x0(), y: y4(), w: w0(), h: 24 }),
      label: "Radio A",
      value: "A",
      selected: this.radio,
    })
    radioA.z = 10

    const radioB = new Radio({
      rect: () => ({ x: x0(), y: y5(), w: w0(), h: 24 }),
      label: "Radio B",
      value: "B",
      selected: this.radio,
    })
    radioB.z = 10

    const paragraph = new Paragraph({
      rect: () => ({ x: x0(), y: y6(), w: w0(), h: Math.max(0, content().h - y6() - pad) }),
      spans: [
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
      style: bodyStyle,
    })

    this.root.add(title)
    this.root.add(hint)
    this.root.add(button)
    this.root.add(status)
    this.root.add(checkbox)
    this.root.add(radioA)
    this.root.add(radioB)
    this.root.add(paragraph)
  }

  compose(compositor: Compositor, viewport: ViewportContext) {
    const w = viewport.rect.w
    const h = viewport.rect.h
    const dpr = viewport.dpr
    const baseId = "controls.base"
    const overlayId = "controls.overlay"

    compositor.withLayer(baseId, w, h, dpr, (ctx) => {
      this.size = { x: viewport.contentRect.w, y: viewport.contentRect.h }
      ctx.save()
      ctx.translate(viewport.contentRect.x - viewport.rect.x, viewport.contentRect.y - viewport.rect.y)
      this.root.draw(ctx as any)
      ctx.restore()
    })
    compositor.blit(baseId, viewport.rect)

    compositor.withLayer(overlayId, w, h, dpr, (ctx) => {
      ctx.save()
      ctx.globalAlpha = 0.9
      ctx.fillStyle = "rgba(80,160,255,0.12)"
      ctx.fillRect(0, 0, w, h)
      ctx.globalAlpha = 1
      ctx.globalCompositeOperation = "source-over"
      ctx.beginPath()
      ctx.arc(w * 0.75, h * 0.3, Math.min(w, h) * 0.22, 0, Math.PI * 2)
      ctx.fillStyle = "rgba(255,80,140,0.22)"
      ctx.fill()
      ctx.restore()
    })
    compositor.blit(overlayId, viewport.rect, { blendMode: "screen", opacity: 0.75 })
  }

  render(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, viewport: ViewportContext) {
    this.size = { x: viewport.contentRect.w, y: viewport.contentRect.h }
    this.root.draw(ctx as any)
  }

  hitTest(pSurface: Vec2) {
    return this.root.hitTest(pSurface)
  }
}
