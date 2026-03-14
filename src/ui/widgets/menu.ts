import { font, theme, neutral } from "@/config/theme"
import { draw, RectOp, TextOp } from "@/core/draw"
import type { InteractionCancelReason } from "@/core/event_stream"
import { createPressMachine } from "@/core/fsm"
import { toGetter, type Rect } from "@/core/rect"
import { PointerUIEvent, UIElement, pointInRect, type Vec2 } from "@/ui/base/ui"

export type MenuItem =
  | { kind?: "item"; key: string; text: string; title?: string; disabled?: boolean; rightText?: string; submenu?: MenuItem[]; onSelect?: () => void }
  | { kind: "separator"; key: string }

export const MENU_ROW_HEIGHT = theme.ui.controls.menuItemHeight
export const MENU_SEPARATOR_HEIGHT = 8

export function measureMenuHeight(items: MenuItem[]) {
  let h = 0
  for (const it of items) h += it.kind === "separator" ? MENU_SEPARATOR_HEIGHT : MENU_ROW_HEIGHT
  return h
}

export class Menu extends UIElement {
  private readonly rect: () => Rect
  private readonly items: () => MenuItem[]
  private readonly selectedKey: (() => string | null) | null
  private readonly onSelect: ((key: string) => void) | null
  private readonly onDismiss: (() => void) | null
  private readonly onHoverItem: ((item: { index: number; rect: Rect; item: Exclude<MenuItem, { kind: "separator" }> } | null) => void) | null

  private hover = false
  private hoveredIndex = -1
  private readonly press = createPressMachine()

  constructor(opts: {
    rect: () => Rect
    items: MenuItem[] | (() => MenuItem[])
    selectedKey?: (() => string | null) | null
    onSelect?: ((key: string) => void) | null
    onDismiss?: (() => void) | null
    onHoverItem?: ((item: { index: number; rect: Rect; item: Exclude<MenuItem, { kind: "separator" }> } | null) => void) | null
  }) {
    super()
    this.rect = opts.rect
    this.items = toGetter(opts.items)
    this.selectedKey = opts.selectedKey ?? null
    this.onSelect = opts.onSelect ?? null
    this.onDismiss = opts.onDismiss ?? null
    this.onHoverItem = opts.onHoverItem ?? null
    this.setBounds(this.rect)
  }

  private selectableIndexFromPoint(p: Vec2) {
    const menu = this.bounds()
    if (!pointInRect(p, menu)) return -1
    const items = this.items()
    let y = menu.y
    for (let i = 0; i < items.length; i++) {
      const it = items[i]!
      const h = it.kind === "separator" ? MENU_SEPARATOR_HEIGHT : MENU_ROW_HEIGHT
      if (p.y >= y && p.y < y + h) {
        if (it.kind === "separator") return -1
        if (it.disabled) return -1
        return i
      }
      y += h
    }
    return -1
  }

  private rawIndexFromPoint(p: Vec2) {
    const menu = this.bounds()
    if (!pointInRect(p, menu)) return -1
    const items = this.items()
    let y = menu.y
    for (let i = 0; i < items.length; i++) {
      const it = items[i]!
      const h = it.kind === "separator" ? MENU_SEPARATOR_HEIGHT : MENU_ROW_HEIGHT
      if (p.y >= y && p.y < y + h) {
        if (it.kind === "separator") return -1
        return i
      }
      y += h
    }
    return -1
  }

  onPointerEnter() {
    this.hover = true
  }

  onPointerLeave() {
    this.hover = false
    this.hoveredIndex = -1
    if (this.press.matches("pressed")) this.press.send({ type: "CANCEL", reason: "leave" })
  }

  onPointerDown(e: PointerUIEvent) {
    if (e.button !== 0) return
    this.press.send({ type: "PRESS", point: { x: e.x, y: e.y } })
    e.capture()
  }

  onPointerMove(e: PointerUIEvent) {
    if (!this.hover) return
    const idx = this.rawIndexFromPoint({ x: e.x, y: e.y })
    if (idx !== this.hoveredIndex) {
      this.hoveredIndex = idx
      if (idx >= 0) {
        const menu = this.bounds()
        const items = this.items()
        let y = menu.y
        for (let i = 0; i < items.length; i++) {
          const it = items[i]!
          const h = it.kind === "separator" ? MENU_SEPARATOR_HEIGHT : MENU_ROW_HEIGHT
          if (i === idx) {
            if (it.kind !== "separator") {
              const row = { x: menu.x + 1, y, w: Math.max(0, menu.w - 2), h }
              this.onHoverItem?.({ index: i, rect: row, item: it })
            }
            break
          }
          y += h
        }
      } else {
        this.onHoverItem?.(null)
      }
      this.invalidateSelf({ pad: 8 })
    }
  }

  onPointerUp(e: PointerUIEvent) {
    if (!this.press.matches("pressed")) return
    this.press.send({ type: "RELEASE", point: { x: e.x, y: e.y } })
    if (!this.hover) return
    const idx = this.selectableIndexFromPoint({ x: e.x, y: e.y })
    const item = this.items()[idx]
    if (item && item.kind !== "separator" && !item.disabled) {
      if (item.submenu) {
        const menu = this.bounds()
        const items = this.items()
        let y = menu.y
        for (let i = 0; i < items.length; i++) {
          const it = items[i]!
          const h = it.kind === "separator" ? MENU_SEPARATOR_HEIGHT : MENU_ROW_HEIGHT
          if (i === idx) {
            const row = { x: menu.x + 1, y, w: Math.max(0, menu.w - 2), h }
            this.onHoverItem?.({ index: i, rect: row, item })
            return
          }
          y += h
        }
        return
      }
      item.onSelect?.()
      this.onSelect?.(item.key)
      return
    }
    this.onDismiss?.()
  }

  onPointerCancel(_e: PointerUIEvent | null, reason: InteractionCancelReason) {
    this.hover = false
    this.hoveredIndex = -1
    if (!this.press.matches("pressed")) return
    this.press.send({ type: "CANCEL", reason })
  }

  protected onDraw(ctx: CanvasRenderingContext2D) {
    const menu = this.bounds()
    if (menu.w <= 0 || menu.h <= 0) return
    const f = font(theme, theme.typography.body)
    draw(
      ctx,
      RectOp(
        { x: menu.x, y: menu.y, w: menu.w, h: menu.h },
        { radius: theme.radii.sm, fill: { color: neutral[0] }, stroke: { color: neutral[6], hairline: true } },
      ),
    )

    const items = this.items()
    const selectedKey = this.selectedKey?.() ?? null
    let y = menu.y
    for (let i = 0; i < items.length; i++) {
      const it = items[i]!
      const h = it.kind === "separator" ? MENU_SEPARATOR_HEIGHT : MENU_ROW_HEIGHT
      const row = { x: menu.x + 1, y, w: Math.max(0, menu.w - 2), h }
      if (it.kind === "separator") {
        const cy = row.y + Math.round(row.h / 2) + 0.5
        draw(
          ctx,
          {
            kind: "Line",
            a: { x: row.x + 10, y: cy },
            b: { x: row.x + row.w - 10, y: cy },
            stroke: { color: neutral[6], hairline: true },
          },
        )
        y += h
        continue
      }
      const hovered = i === this.hoveredIndex
      const selected = it.key === selectedKey
      if ((hovered && !it.disabled) || selected) {
        draw(ctx, { kind: "Rect", rect: row, fill: { color: hovered ? neutral[5] : neutral[4] } })
      }
      const textColor = it.disabled ? theme.colors.textDisabled : theme.colors.textPrimary
      draw(
        ctx,
        TextOp({
          x: row.x + theme.ui.controls.rowTextPadX,
          y: row.y + row.h / 2 + 0.5,
          text: it.text,
          style: { color: textColor, font: f, baseline: "middle" },
        }),
      )
      const rightText = it.rightText
      const hasSubmenu = !!it.submenu
      if (rightText) {
        draw(
          ctx,
          TextOp({
            x: row.x + row.w - (hasSubmenu ? theme.ui.controls.rowTextPadX + 14 : theme.ui.controls.rowTextPadX),
            y: row.y + row.h / 2 + 0.5,
            text: rightText,
            style: { color: it.disabled ? theme.colors.textFaint : theme.colors.textMuted, font: f, baseline: "middle", align: "right" },
          }),
        )
      }
      if (hasSubmenu) {
        draw(
          ctx,
          TextOp({
            x: row.x + row.w - theme.ui.controls.rowTextPadX,
            y: row.y + row.h / 2 + 0.5,
            text: "›",
            style: { color: it.disabled ? theme.colors.textFaint : theme.colors.textMuted, font: f, baseline: "middle", align: "right" },
          }),
        )
      }
      y += h
    }
  }
}
