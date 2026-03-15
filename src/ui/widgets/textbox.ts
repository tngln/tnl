import { font, theme } from "@/config/theme"
import { draw, RectOp, TextOp } from "@/core/draw"
import { measureTextWidth } from "@/core/draw.text"
import { signal, type Signal } from "@/core/reactivity"
import { toGetter, ZERO_RECT, type Rect } from "@/core/rect"
import { getTextInputBridge, type TextInputBridge } from "@/platform/web"
import { createMeasureContext } from "@/platform/web/canvas"
import { CursorRegion, KeyUIEvent, PointerUIEvent, UIElement } from "@/ui/base/ui"
import type { WidgetDescriptor } from "@/ui/builder/widget_registry"

const TEXTBOX_HEIGHT = theme.ui.controls.inputHeight
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
  private rectValue: Rect = ZERO_RECT
  private value: Signal<string>
  private placeholderValue: string = ""
  private activeValue: boolean = true
  private disabledValue: boolean = false
  private inputBridge: TextInputBridge
  private readonly sessionId = `${SESSION_PREFIX}.${nextSessionId++}`

  private hover = false
  private focused = false
  private dragAnchor: number | null = null
  private selectionStart = 0
  private selectionEnd = 0
  private scrollX = 0
  private readonly measureCtx = createMeasureContext()
  private caretVisible = false
  private caretBlinkTimer: ReturnType<typeof setTimeout> | null = null
  private caretBlinkHoldUntil = 0

  constructor(opts: {
    rect: () => Rect
    value: Signal<string>
    placeholder?: string | (() => string)
    active?: () => boolean
    disabled?: () => boolean
    inputBridge?: TextInputBridge
  }) {
    super()
    this.value = opts.value
    this.inputBridge = opts.inputBridge ?? getTextInputBridge()
    this.update(opts)
    this.setBounds(() => this.rectValue, () => this.activeValue)
    this.add(
      new CursorRegion({
        rect: () => this.bounds(),
        cursor: "text",
        active: () => this.interactive(),
      }),
    )
  }

  update(opts: {
    rect: () => Rect
    value: Signal<string>
    placeholder?: string | (() => string)
    active?: () => boolean
    disabled?: () => boolean
    inputBridge?: TextInputBridge
  }) {
    this.rectValue = opts.rect()
    this.value = opts.value
    this.placeholderValue = typeof opts.placeholder === "function" ? opts.placeholder() : (opts.placeholder ?? "")
    this.activeValue = opts.active ? opts.active() : true
    this.disabledValue = opts.disabled ? opts.disabled() : false
    if (opts.inputBridge) this.inputBridge = opts.inputBridge
  }

  canFocus() {
    return this.interactive()
  }

  // ... (keep rest of methods but replace rect(), active(), disabled() calls with property access)

  onFocus() {
    if (!this.interactive()) return
    this.focused = true
    const caret = this.selectionEnd
    this.selectionStart = caret
    this.selectionEnd = caret
    this.resetCaretBlink()
    this.syncBridge()
    this.invalidateSelf({ pad: 6 })
  }

  onBlur() {
    const caret = this.selectionEnd
    this.focused = false
    this.dragAnchor = null
    this.selectionStart = caret
    this.selectionEnd = caret
    this.stopCaretBlink()
    this.inputBridge.blur(this.sessionId)
    this.invalidateSelf({ pad: 6 })
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
    this.invalidateSelf({ pad: 6 })
  }

  onPointerMove(e: PointerUIEvent) {
    if (!this.interactive() || this.dragAnchor === null || (e.buttons & 1) === 0) return
    const index = this.indexFromPoint(e.x)
    this.setSelection(this.dragAnchor, index)
    this.resetCaretBlink()
    this.syncBridge()
    this.invalidateSelf({ pad: 6 })
  }

  onPointerUp(e: PointerUIEvent) {
    if (!this.interactive() || this.dragAnchor === null) return
    const index = this.indexFromPoint(e.x)
    this.setSelection(this.dragAnchor, index)
    this.dragAnchor = null
    this.resetCaretBlink()
    this.syncBridge()
    this.invalidateSelf({ pad: 6 })
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
    if (!this.activeValue) return
    const rect = this.rectValue
    const disabled = this.disabledValue
    const focused = this.focused && !disabled
    const bg = disabled ? theme.colors.disabled : theme.colors.inputBg
    const stroke = focused ? theme.colors.borderFocus : theme.colors.border
    const textValue = this.value.get()
    const placeholder = this.placeholderValue
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
      RectOp(
        { x: rect.x, y: rect.y, w: rect.w, h: rect.h },
        { radius: theme.radii.sm, fill: { paint: bg }, stroke: { color: stroke, hairline: true } },
      ),
    )

    ctx.save()
    ctx.beginPath()
    ctx.rect(innerX, rect.y + 1, innerW, Math.max(0, rect.h - 2))
    ctx.clip()

    if (focused && selection.selectionStart !== selection.selectionEnd && textValue) {
      const selectionX = innerX + this.measurePrefix(ctx, selection.selectionStart) - this.scrollX
      const selectionW = this.measurePrefix(ctx, selection.selectionEnd) - this.measurePrefix(ctx, selection.selectionStart)
      ctx.fillStyle = theme.colors.inputSelection
      ctx.fillRect(selectionX, rect.y + 4, selectionW, rect.h - 8)
    }

    draw(
      ctx,
      TextOp({
        x: innerX - this.scrollX,
        y: innerY,
        text: display,
        style: {
          color: isPlaceholder ? theme.colors.textMuted : theme.colors.text,
          font: fontSpec,
          baseline: "middle",
        },
      }),
    )

    if (focused && this.caretVisible && selection.selectionStart === selection.selectionEnd) {
      const caretX = innerX + this.measurePrefix(ctx, this.selectionEnd) - this.scrollX
      ctx.fillStyle = theme.colors.text
      ctx.fillRect(caretX, rect.y + 5, 1, rect.h - 10)
    }

    ctx.restore()
  }

  private interactive() {
    return this.activeValue && !this.disabledValue
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
    const rect = this.rectValue
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
    const rect = this.rectValue
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
          this.invalidateSelf({ pad: 6 })
        },
        onBlur: () => {
          this.focused = false
          this.stopCaretBlink()
          this.invalidateSelf({ pad: 6 })
        },
      },
      state,
    )
  }

  private isPrintableKey(e: KeyUIEvent) {
    return e.key.length === 1 && !e.ctrlKey && !e.metaKey
  }

  private resetCaretBlink() {
    this.caretBlinkHoldUntil = Date.now() + CARET_BLINK_MS
    this.updateCaretBlinkState(true)
    this.scheduleCaretBlink()
  }

  private stopCaretBlink() {
    if (this.caretBlinkTimer !== null) {
      clearTimeout(this.caretBlinkTimer)
      this.caretBlinkTimer = null
    }
    this.caretVisible = false
    this.caretBlinkHoldUntil = 0
  }

  private scheduleCaretBlink() {
    if (this.caretBlinkTimer !== null) clearTimeout(this.caretBlinkTimer)
    if (!this.focused) {
      this.caretBlinkTimer = null
      return
    }
    const now = Date.now()
    const nextAt = this.nextCaretBlinkAt(now)
    const delay = Math.max(16, nextAt - now)
    this.caretBlinkTimer = setTimeout(() => {
      this.caretBlinkTimer = null
      if (!this.focused) {
        this.stopCaretBlink()
        return
      }
      this.updateCaretBlinkState()
      this.scheduleCaretBlink()
    }, delay)
  }

  private nextCaretBlinkAt(now: number) {
    if (now < this.caretBlinkHoldUntil) return this.caretBlinkHoldUntil
    const elapsed = now - this.caretBlinkHoldUntil
    const phase = Math.floor(elapsed / CARET_BLINK_MS)
    return this.caretBlinkHoldUntil + (phase + 1) * CARET_BLINK_MS
  }

  updateCaretBlinkState(forceVisible = false) {
    const now = Date.now()
    const nextVisible = forceVisible || now < this.caretBlinkHoldUntil
      ? true
      : Math.floor((now - this.caretBlinkHoldUntil) / CARET_BLINK_MS) % 2 === 1
    if (this.caretVisible === nextVisible) return
    this.caretVisible = nextVisible
    this.invalidateSelf({ pad: 6 })
  }

  onRuntimeDeactivate() {
    this.hover = false
    this.dragAnchor = null
    if (this.focused) {
      this.focused = false
      this.inputBridge.blur(this.sessionId)
    }
    this.stopCaretBlink()
  }
}

type TextBoxState = {
  widget: TextBox
  rect: Rect
  active: boolean
  disabled: boolean
}

export const textBoxDescriptor: WidgetDescriptor<TextBoxState, { value: Signal<string>; placeholder?: string; disabled?: boolean }> = {
  id: "textbox",
  create: () => {
    const state = { rect: ZERO_RECT, active: false, disabled: false } as TextBoxState
    state.widget = new TextBox({
      rect: () => state.rect,
      value: signal(""),
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
      rect: () => state.rect,
      value: props.value,
      placeholder: props.placeholder,
      active: () => state.active,
      disabled: () => state.disabled,
    })
  },
}

export { TEXTBOX_HEIGHT }
