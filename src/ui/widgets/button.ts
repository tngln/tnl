import { draw, RRect, Text } from "../../core/draw"
import { font, theme } from "../../config/theme"
import { type Rect, ZERO_RECT } from "../../core/rect"
import type { WidgetDescriptor } from "../builder/widget_registry"
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
      ? theme.colors.controlDisabled
      : this.pressed()
        ? theme.colors.controlPressed
        : this.hover
          ? theme.colors.controlHover
          : "transparent"
    const stroke = disabled ? theme.colors.white10 : theme.colors.windowBorder
    const textColor = disabled ? theme.colors.textMuted : theme.colors.textPrimary
    draw(
      ctx,
      RRect(
        { x: r.x, y: r.y, w: r.w, h: r.h, r: theme.radii.sm },
        { fill: { color: bg }, stroke: { color: stroke, hairline: true }, pixelSnap: true },
      ),
      Text({
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
      RRect(
        { x: tipX, y: tipY, w: tipW, h: tipH, r: theme.radii.sm },
        { fill: { color: theme.colors.appBg96 }, stroke: { color: theme.colors.white12, hairline: true }, pixelSnap: true },
      ),
      Text({
        x: tipX + tipW / 2,
        y: tipY + tipH / 2 + 0.5,
        text: title,
        style: {
          color: theme.colors.textPrimary,
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
