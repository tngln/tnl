import { draw, Circle, Text } from "../../core/draw"
import { font, theme } from "../../config/theme"
import { type Signal } from "../../core/reactivity"
import { PointerUIEvent, UIElement, pointInRect, type Rect, type Vec2 } from "../base/ui"

function isActive(active: (() => boolean) | undefined) {
  return active ? active() : true
}

export class Radio extends UIElement {
  private readonly rect: () => Rect
  private readonly label: () => string
  private readonly value: string
  private readonly selected: Signal<string>
  private readonly active: (() => boolean) | undefined

  private hover = false
  private down = false

  constructor(opts: { rect: () => Rect; label: string | (() => string); value: string; selected: Signal<string>; active?: () => boolean }) {
    super()
    this.rect = opts.rect
    if (typeof opts.label === "string") {
      const t = opts.label
      this.label = () => t
    } else {
      this.label = opts.label
    }
    this.value = opts.value
    this.selected = opts.selected
    this.active = opts.active
  }

  bounds(): Rect {
    if (!isActive(this.active)) return { x: 0, y: 0, w: 0, h: 0 }
    return this.rect()
  }

  protected containsPoint(p: Vec2) {
    return pointInRect(p, this.bounds())
  }

  protected onDraw(ctx: CanvasRenderingContext2D) {
    if (!isActive(this.active)) return
    const r = this.rect()
    const cx = r.x + 8
    const cy = r.y + 10
    const stroke = this.down
      ? "rgba(233,237,243,0.30)"
      : this.hover
        ? "rgba(233,237,243,0.24)"
        : "rgba(233,237,243,0.20)"

    draw(ctx, Circle({ x: cx, y: cy, r: 8 }, { stroke: { color: stroke, hairline: true } }))

    if (this.selected.peek() === this.value) {
      draw(ctx, Circle({ x: cx, y: cy, r: 4 }, { fill: { color: theme.colors.textPrimary } }))
    }

    draw(
      ctx,
      Text({
        x: r.x + 24,
        y: r.y,
        text: this.label(),
        style: { color: theme.colors.textPrimary, font: font(theme, theme.typography.body), baseline: "top" },
      }),
    )
  }

  onPointerEnter() {
    this.hover = true
  }

  onPointerLeave() {
    this.hover = false
    this.down = false
  }

  onPointerDown(e: PointerUIEvent) {
    if (!isActive(this.active)) return
    if (e.button !== 0) return
    this.down = true
    e.capture()
  }

  onPointerUp(_e: PointerUIEvent) {
    if (!this.down) return
    this.down = false
    if (!this.hover) return
    this.selected.set(this.value)
  }
}
