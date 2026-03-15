import { font, theme, neutral } from "@/config/theme"
import { draw, RectOp, TextOp } from "@/core/draw"
import { type Rect, ZERO_RECT } from "@/core/rect"
import type { WidgetDescriptor } from "@/ui/builder/widget_registry"
import { InteractiveElement } from "./interactive"

export class Button extends InteractiveElement {
  private textValue: string = ""
  private titleValue?: string = ""
  private onClickHandler?: () => void

  constructor(opts: { rect: () => Rect; text: string | (() => string); title?: string | (() => string); onClick?: () => void; active?: () => boolean; disabled?: () => boolean }) {
    super(opts)
    this.update(opts)
  }

  update(opts: { text: string | (() => string); title?: string | (() => string); onClick?: () => void }) {
    this.textValue = typeof opts.text === "function" ? opts.text() : opts.text
    this.titleValue = opts.title ? (typeof opts.title === "function" ? opts.title() : opts.title) : this.textValue
    this.onClickHandler = opts.onClick
  }

  protected onActivate() {
    this.onClickHandler?.()
  }

  protected onDraw(ctx: CanvasRenderingContext2D) {
    if (!this._active()) return
    const r = this._rect()
    const disabled = this._disabled()
    const bg = disabled
      ? theme.colors.disabled
      : this.pressed()
        ? theme.colors.pressed
        : this.hover
          ? theme.colors.hover
          : "transparent"
    const stroke = disabled ? neutral[400] : theme.colors.border
    const textColor = disabled ? theme.colors.textMuted : theme.colors.text
    draw(
      ctx,
      RectOp(
        { x: r.x, y: r.y, w: r.w, h: r.h },
        { radius: theme.radii.sm, fill: { color: bg }, stroke: { color: stroke, hairline: true } },
      ),
      TextOp({
        x: r.x + r.w / 2,
        y: r.y + r.h / 2 + 0.5,
        text: this.textValue,
        style: {
          color: textColor,
          font: font(theme, theme.typography.body),
          align: "center",
          baseline: "middle",
        },
      }),
    )

    const title = this.titleValue?.trim()
    if (!title || !this.hover || this.pressed() || title === this.textValue) return  // eslint-disable-line @typescript-eslint/prefer-nullish-coalescing
    ctx.save()
    ctx.font = font(theme, theme.typography.body)
    const metrics = ctx.measureText(title)
    ctx.restore()
    const padX = 6
    const padY = 4
    const tipW = Math.ceil(metrics.width + padX * 2)
    const tipH = 20
    const tipX = r.x + Math.max(0, (r.w - tipW) / 2)
    const tipY = Math.max(0, r.y - tipH - 6)
    draw(
      ctx,
      RectOp(
        { x: tipX, y: tipY, w: tipW, h: tipH },
        { radius: theme.radii.sm, fill: { color: neutral[900] }, stroke: { color: neutral[400], hairline: true } },
      ),
      TextOp({
        x: tipX + tipW / 2,
        y: tipY + tipH / 2 + 0.5,
        text: title,
        style: {
          color: theme.colors.text,
          font: font(theme, theme.typography.body),
          align: "center",
          baseline: "middle",
        },
      }),
    )
  }
}

type ButtonState = {
  widget: Button
  rect: Rect
  active: boolean
  disabled: boolean
}

export const buttonDescriptor: WidgetDescriptor<ButtonState, { text: string; title?: string; disabled?: boolean; onClick?: () => void }> = {
  id: "button",
  create: () => {
    const state = { rect: ZERO_RECT, active: false, disabled: false } as ButtonState
    state.widget = new Button({
      rect: () => state.rect,
      text: "",
      active: () => state.active,
      disabled: () => state.disabled,
    })
    return state
  },
  getWidget: (state) => state.widget,
  mount: (state, props, rect, active) => {
    state.rect = rect
    state.active = active
    state.disabled = props.disabled ?? false
    state.widget.update({
      text: props.text,
      title: props.title,
      onClick: props.onClick,
    })
  },
}
