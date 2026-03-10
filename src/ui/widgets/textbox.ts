import { draw, RRect, Text } from "../../core/draw"
import { measureTextWidth } from "../../core/draw.text"
import { toGetter, ZERO_RECT, type Rect } from "../../core/rect"
import type { Signal } from "../../core/reactivity"
import { font, theme } from "../../config/theme"
import { invalidateAll } from "../invalidate"
import { get1pxTextboxBridge, type OnePxTextboxBridge } from "../../platform/web"
import { createMeasureContext } from "../../platform/web/canvas"
import { CursorRegion, KeyUIEvent, PointerUIEvent, UIElement, pointInRect, type Vec2 } from "../base/ui"

const TEXTBOX_HEIGHT = 28
const PAD_X = 8
const SESSION_PREFIX = "textbox"
const CARET_BLINK_MS = 530
let nextSessionId = 1

function clampSelection(value: string, start: number, end: number) {
  const max = value.length
  const selectionStart = Math.max(0, Math.min(max, start))
  const selectionEnd = Math.max(selectionStart, Math.min(max, end))
  return { selectionStart, selectionEnd }
}

function hasShortcutModifier(e: { ctrlKey: boolean; metaKey: boolean }) {
  return e.ctrlKey || e.metaKey
}

export class TextBox extends UIElement {
  private readonly rect: () => Rect
  private readonly value: Signal<string>
  private readonly placeholder: () => string
  private readonly active: () => boolean
  private readonly disabled: () => boolean
  private readonly inputBridge: OnePxTextboxBridge
  private readonly sessionId = `${SESSION_PREFIX}.${nextSessionId++}`

  private hover = false
  private focused = false
  private dragAnchor: number | null = null
  private selectionStart = 0
  private selectionEnd = 0
  private scrollX = 0
  private readonly measureCtx = createMeasureContext()
  private caretVisible = false
  private caretBlinkTimer: ReturnType<typeof setInterval> | null = null

  constructor(opts: {
    rect: () => Rect
    value: Signal<string>
    placeholder?: string | (() => string)
    active?: () => boolean
    disabled?: () => boolean
    inputBridge?: OnePxTextboxBridge
  }) {
    super()
    this.rect = opts.rect
    this.value = opts.value
    this.placeholder = toGetter(opts.placeholder, "")
    this.active = opts.active ?? (() => true)
    this.disabled = opts.disabled ?? (() => false)
    this.inputBridge = opts.inputBridge ?? get1pxTextboxBridge()
    this.add(
      new CursorRegion({
        rect: () => this.bounds(),
        cursor: "text",
        active: () => this.interactive(),
      }),
    )
  }

  bounds(): Rect {
    if (!this.active()) return ZERO_RECT
    return this.rect()
  }

  protected containsPoint(p: Vec2) {
    return pointInRect(p, this.bounds())
  }

  canFocus() {
    return this.interactive()
  }

  onFocus() {
    if (!this.interactive()) return
    this.focused = true
    const caret = this.selectionEnd
    this.selectionStart = caret
    this.selectionEnd = caret
    this.resetCaretBlink()
    this.syncBridge()
    invalidateAll()
  }

  onBlur() {
    const caret = this.selectionEnd
    this.focused = false
    this.dragAnchor = null
    this.selectionStart = caret
    this.selectionEnd = caret
    this.stopCaretBlink()
    this.inputBridge.blur(this.sessionId)
    invalidateAll()
  }

  onPointerEnter() {
    if (!this.interactive()) return
    this.hover = true
  }

  onPointerLeave() {
    this.hover = false
  }

  onPointerDown(e: PointerUIEvent) {
    if (!this.interactive() || e.button !== 0) return
    e.requestFocus(this)
    if (!this.focused) {
      this.focused = true
      this.resetCaretBlink()
    }
    const index = this.indexFromPoint(e.x)
    this.dragAnchor = index
    this.setSelection(index, index)
    this.syncBridge()
    e.capture()
    invalidateAll()
  }

  onPointerMove(e: PointerUIEvent) {
    if (!this.interactive() || this.dragAnchor === null || (e.buttons & 1) === 0) return
    const index = this.indexFromPoint(e.x)
    this.setSelection(this.dragAnchor, index)
    this.resetCaretBlink()
    this.syncBridge()
    invalidateAll()
  }

  onPointerUp(e: PointerUIEvent) {
    if (!this.interactive() || this.dragAnchor === null) return
    const index = this.indexFromPoint(e.x)
    this.setSelection(this.dragAnchor, index)
    this.dragAnchor = null
    this.resetCaretBlink()
    this.syncBridge()
    invalidateAll()
  }

  onPointerCancel() {
    this.dragAnchor = null
  }

  onKeyDown(e: KeyUIEvent) {
    if (!this.focused || !this.interactive()) return

    if (hasShortcutModifier(e) && e.code === "KeyA") {
      const value = this.value.get()
      this.setSelection(0, value.length)
      this.resetCaretBlink()
      this.syncBridge()
      e.preventDefault()
      return
    }

    if (e.code === "ArrowLeft") {
      this.moveCaret(-1, e.shiftKey)
      this.resetCaretBlink()
      this.syncBridge()
      e.preventDefault()
      return
    }
    if (e.code === "ArrowRight") {
      this.moveCaret(1, e.shiftKey)
      this.resetCaretBlink()
      this.syncBridge()
      e.preventDefault()
      return
    }
    if (e.code === "Home") {
      this.moveCaretTo(0, e.shiftKey)
      this.resetCaretBlink()
      this.syncBridge()
      e.preventDefault()
      return
    }
    if (e.code === "End") {
      this.moveCaretTo(this.value.get().length, e.shiftKey)
      this.resetCaretBlink()
      this.syncBridge()
      e.preventDefault()
      return
    }
    if (e.code === "Enter") {
      e.consume()
      return
    }

    const mod = hasShortcutModifier(e)
    const shouldConsume =
      this.isPrintableKey(e) ||
      e.code === "Backspace" ||
      e.code === "Delete" ||
      (mod && (e.code === "KeyC" || e.code === "KeyX" || e.code === "KeyV"))

    if (shouldConsume) e.consume()
  }

  protected onDraw(ctx: CanvasRenderingContext2D) {
    if (!this.active()) return
    const rect = this.rect()
    const disabled = this.disabled()
    const focused = this.focused && !disabled
    const bg = disabled ? theme.colors.inputDisabledBg : theme.colors.inputBg
    const stroke = focused ? theme.colors.inputBorderFocus : theme.colors.inputBorder
    const textValue = this.value.get()
    const placeholder = this.placeholder()
    const display = textValue || placeholder
    const isPlaceholder = !textValue
    const fontSpec = font(theme, theme.typography.body)
    const innerX = rect.x + PAD_X
    const innerY = rect.y + rect.h / 2 + 0.5
    const innerW = Math.max(0, rect.w - PAD_X * 2)
    const selection = this.normalizedSelection()

    this.ensureCaretVisible(ctx, innerW)

    draw(
      ctx,
      RRect(
        { x: rect.x, y: rect.y, w: rect.w, h: rect.h, r: theme.radii.sm },
        { fill: { color: bg }, stroke: { color: stroke, hairline: true }, pixelSnap: true },
      ),
    )

    ctx.save()
    ctx.beginPath()
    ctx.rect(innerX, rect.y + 1, innerW, Math.max(0, rect.h - 2))
    ctx.clip()

    if (focused && selection.selectionStart !== selection.selectionEnd && textValue) {
      const selectionX = innerX + this.measurePrefix(ctx, selection.selectionStart) - this.scrollX
      const selectionW = this.measurePrefix(ctx, selection.selectionEnd) - this.measurePrefix(ctx, selection.selectionStart)
      ctx.fillStyle = theme.colors.inputSelectionBg
      ctx.fillRect(selectionX, rect.y + 4, selectionW, rect.h - 8)
    }

    draw(
      ctx,
      Text({
        x: innerX - this.scrollX,
        y: innerY,
        text: display,
        style: {
          color: isPlaceholder ? theme.colors.inputPlaceholder : theme.colors.inputText,
          font: fontSpec,
          baseline: "middle",
        },
      }),
    )

    if (focused && this.caretVisible && selection.selectionStart === selection.selectionEnd) {
      const caretX = innerX + this.measurePrefix(ctx, this.selectionEnd) - this.scrollX
      ctx.fillStyle = theme.colors.inputText
      ctx.fillRect(caretX, rect.y + 5, 1, rect.h - 10)
    }

    ctx.restore()
  }

  private interactive() {
    return this.active() && !this.disabled()
  }

  private normalizedSelection() {
    return this.selectionStart <= this.selectionEnd
      ? { selectionStart: this.selectionStart, selectionEnd: this.selectionEnd }
      : { selectionStart: this.selectionEnd, selectionEnd: this.selectionStart }
  }

  private measurePrefix(ctx: CanvasRenderingContext2D, index: number) {
    const value = this.value.get().slice(0, index)
    return measureTextWidth(ctx, value, font(theme, theme.typography.body))
  }

  private indexFromPoint(x: number) {
    const rect = this.rect()
    const value = this.value.get()
    const localX = x - rect.x - PAD_X + this.scrollX
    const context = this.measureCtx
    if (!context) return localX <= 0 ? 0 : value.length
    context.font = font(theme, theme.typography.body)
    let bestIndex = 0
    let bestDistance = Number.POSITIVE_INFINITY
    for (let i = 0; i <= value.length; i++) {
      const width = measureTextWidth(context as CanvasRenderingContext2D, value.slice(0, i), context.font)
      const distance = Math.abs(width - localX)
      if (distance < bestDistance) {
        bestDistance = distance
        bestIndex = i
      }
    }
    return bestIndex
  }

  private setSelection(start: number, end: number) {
    const next = clampSelection(this.value.get(), start, end)
    this.selectionStart = next.selectionStart
    this.selectionEnd = next.selectionEnd
  }

  private moveCaret(delta: number, extend: boolean) {
    const selection = this.normalizedSelection()
    if (!extend && selection.selectionStart !== selection.selectionEnd) {
      const caret = delta < 0 ? selection.selectionStart : selection.selectionEnd
      this.setSelection(caret, caret)
      return
    }
    const anchor = extend ? this.selectionStart : this.selectionEnd
    const next = Math.max(0, Math.min(this.value.get().length, this.selectionEnd + delta))
    this.setSelection(extend ? anchor : next, next)
  }

  private moveCaretTo(next: number, extend: boolean) {
    if (!extend) {
      this.setSelection(next, next)
      return
    }
    this.setSelection(this.selectionStart, next)
  }

  private ensureCaretVisible(ctx: CanvasRenderingContext2D, innerW: number) {
    const caretX = this.measurePrefix(ctx, this.selectionEnd)
    if (caretX - this.scrollX > innerW) this.scrollX = caretX - innerW
    if (caretX - this.scrollX < 0) this.scrollX = caretX
    this.scrollX = Math.max(0, this.scrollX)
  }

  private syncBridge() {
    if (!this.focused || !this.interactive()) return
    const rect = this.rect()
    const caretRectCss = {
      x: rect.x + PAD_X,
      y: rect.y + rect.h / 2,
      w: 1,
      h: rect.h,
    }
    const state = {
      value: this.value.get(),
      selectionStart: this.normalizedSelection().selectionStart,
      selectionEnd: this.normalizedSelection().selectionEnd,
      caretRectCss,
    }
    if (this.inputBridge.isFocused(this.sessionId)) {
      this.inputBridge.sync(this.sessionId, state)
      return
    }
    this.inputBridge.focus(
      {
        id: this.sessionId,
        onStateChange: (next) => {
          this.value.set(next.value)
          this.setSelection(next.selectionStart, next.selectionEnd)
          this.resetCaretBlink()
          invalidateAll()
        },
        onBlur: () => {
          this.focused = false
          this.stopCaretBlink()
          invalidateAll()
        },
      },
      state,
    )
  }

  private isPrintableKey(e: KeyUIEvent) {
    return e.key.length === 1 && !e.ctrlKey && !e.metaKey
  }

  private resetCaretBlink() {
    this.caretVisible = true
    if (this.caretBlinkTimer !== null) clearInterval(this.caretBlinkTimer)
    this.caretBlinkTimer = setInterval(() => {
      if (!this.focused) {
        this.stopCaretBlink()
        return
      }
      this.caretVisible = !this.caretVisible
      invalidateAll()
    }, CARET_BLINK_MS)
  }

  private stopCaretBlink() {
    if (this.caretBlinkTimer !== null) {
      clearInterval(this.caretBlinkTimer)
      this.caretBlinkTimer = null
    }
    this.caretVisible = false
  }
}

export { TEXTBOX_HEIGHT }
