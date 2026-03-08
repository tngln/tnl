import { draw, Line, RRect, Text } from "../../core/draw"
import { font, theme } from "../../config/theme"
import { type Signal } from "../../core/reactivity"
import { PointerUIEvent, UIElement, pointInRect, type Rect, type Vec2 } from "../base/ui"

export class Checkbox extends UIElement {
  private readonly rect: () => Rect
  private readonly label: () => string
  private readonly checked: Signal<boolean>
  private readonly active: () => boolean

  private hover = false
  private down = false

  constructor(opts: { rect: () => Rect; label: string | (() => string); checked: Signal<boolean>; active?: () => boolean }) {
    super()
    this.rect = opts.rect
    if (typeof opts.label === "string") {
      const t = opts.label
      this.label = () => t
    } else {
      this.label = opts.label
    }
    this.checked = opts.checked
    this.active = opts.active ?? (() => true)
  }

  bounds(): Rect {
    if (!this.active()) return { x: 0, y: 0, w: 0, h: 0 }
    return this.rect()
  }

  protected containsPoint(p: Vec2) {
    return pointInRect(p, this.bounds())
  }

  protected onDraw(ctx: CanvasRenderingContext2D) {
    if (!this.active()) return
    const r = this.rect()
    const box = { x: r.x, y: r.y + 2, w: 16, h: 16, r: 4 }
    const bg = this.down
      ? "rgba(233,237,243,0.10)"
      : this.hover
        ? "rgba(233,237,243,0.08)"
        : "rgba(233,237,243,0.06)"

    draw(
      ctx,
      RRect(box, { fill: { color: bg }, stroke: { color: theme.colors.windowBorder, hairline: true }, pixelSnap: true }),
      Text({
        x: r.x + 24,
        y: r.y,
        text: this.label(),
        style: { color: theme.colors.textPrimary, font: font(theme, theme.typography.body), baseline: "top" },
      }),
    )

    if (this.checked.peek()) {
      const x0 = box.x + 4
      const y0 = box.y + 8
      const x1 = box.x + 7
      const y1 = box.y + 11
      const x2 = box.x + 13
      const y2 = box.y + 5
      draw(
        ctx,
        Line({ x: x0, y: y0 }, { x: x1, y: y1 }, { color: theme.colors.textPrimary, width: 2.0, lineCap: "round" }),
        Line({ x: x1, y: y1 }, { x: x2, y: y2 }, { color: theme.colors.textPrimary, width: 2.0, lineCap: "round" }),
      )
    }
  }

  onPointerEnter() {
    this.hover = true
  }

  onPointerLeave() {
    this.hover = false
    this.down = false
  }

  onPointerDown(e: PointerUIEvent) {
    if (!this.active()) return
    if (e.button !== 0) return
    this.down = true
    e.capture()
  }

  onPointerUp(_e: PointerUIEvent) {
    if (!this.down) return
    this.down = false
    if (!this.hover) return
    this.checked.set((v) => !v)
  }
}
