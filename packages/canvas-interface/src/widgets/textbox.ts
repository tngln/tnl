import { font, theme } from "../theme"
import { ZERO_RECT, type Rect } from "../draw"
import { signal, type Signal } from "../reactivity"
import { getTextInputBridge, type TextInputBridge, type TextInputSyncState } from "../platform/web/text_input"
import { createMeasureContext } from "../platform/web/canvas"
import { createVisualHostState, drawVisualHost, syncVisualHostState } from "../builder/visual_host"
import type { RuntimeStateBinding } from "../builder/runtime_state"
import { writeRuntimeRegions } from "../builder/runtime_state"
import { ensureTextCaretVisible, measureTextPrefix, resolveTextIndexFromPoint, blurTextSession, blurTextSessionBridge, createSessionBridgeState, createTextSessionState, focusTextSession, focusTextSessionBridge, moveSessionCaret, moveSessionCaretTo, normalizedTextSessionSelection, setSessionSelection, syncTextSessionBridge, type TextSessionState } from "../text"
import { resolveTextBoxRegions } from "../builder/widget_regions"
import type { VisualStyleInput } from "../builder/visual"
import { buildTextBoxChromeVisual, buildTextBoxTextVisual, type TextBoxChromeVisualModel, type TextBoxTextVisualModel, type TextBoxVisualModel } from "../builder/widget_visuals"
import { CursorRegion, KeyUIEvent, UIElement, type DebugRuntimeStateSnapshot } from "../ui/ui_base"
import type { RetainedPayload, WidgetDescriptor } from "../builder/widget_registry"

const TEXTBOX_HEIGHT = theme.ui.controls.inputHeight
const PAD_X = 8
const SESSION_PREFIX = "textbox"
const CARET_BLINK_MS = 530
let nextSessionId = 1

export type TextBoxBehaviorProps = {
  value: Signal<string>
  placeholder?: string
}

export type TextBoxWidgetProps = RetainedPayload<TextBoxBehaviorProps, TextBoxVisualModel | undefined>

function hasShortcutModifier(e: { ctrlKey: boolean; metaKey: boolean }) {
  return e.ctrlKey || e.metaKey
}

export class TextBox extends UIElement {
  private rectValue: Rect = ZERO_RECT
  private value: Signal<string>
  private placeholderValue: string = ""
  private activeValue: boolean = true
  private disabledValue: boolean = false
  private runtimeState?: RuntimeStateBinding
  private chromeVisualModel: TextBoxChromeVisualModel = { focused: false }
  private readonly chromeVisualHost = createVisualHostState<TextBoxChromeVisualModel>()
  private readonly textVisualHost = createVisualHostState<TextBoxTextVisualModel>()
  private inputBridge: TextInputBridge
  private readonly sessionId = `${SESSION_PREFIX}.${nextSessionId++}`
  private dragAnchor: number | null = null
  private readonly session: TextSessionState = createTextSessionState()
  private readonly measureCtx = createMeasureContext()
  private caretBlinkTimer: ReturnType<typeof setTimeout> | null = null

  constructor(opts: {
    rect: () => Rect
    value: Signal<string>
    placeholder?: string | (() => string)
    active?: () => boolean
    disabled?: () => boolean
    visualStyle?: VisualStyleInput
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

    this.on("focus", () => {
      if (!this.interactive()) return
      focusTextSession(this.session)
      const caret = this.session.selectionEnd
      this.session.selectionStart = caret
      this.session.selectionEnd = caret
      this.resetCaretBlink()
      this.syncBridge()
      this.invalidateSelf({ source: "textbox.focus" })
    })
    this.on("blur", () => {
      this.dragAnchor = null
      blurTextSession(this.session)
      this.stopCaretBlink()
      blurTextSessionBridge(this.inputBridge, this.sessionId)
      this.invalidateSelf({ source: "textbox.blur" })
    })
    this.on("pointerdown", (e) => {
      if (!this.interactive() || e.button !== 0) return
      e.requestFocus(this)
      if (!this.session.focused) {
        focusTextSession(this.session)
        this.resetCaretBlink()
      }
      const index = this.indexFromPoint(e.x)
      this.dragAnchor = index
      this.setSelection(index, index)
      this.syncBridge()
      e.capture()
      this.invalidateSelf({ source: "textbox.pointerDown" })
    })
    this.on("pointermove", (e) => {
      if (!this.interactive() || this.dragAnchor === null || (e.buttons & 1) === 0) return
      const index = this.indexFromPoint(e.x)
      this.setSelection(this.dragAnchor, index)
      this.resetCaretBlink()
      this.syncBridge()
      this.invalidateSelf({ source: "textbox.pointerMove" })
    })
    this.on("pointerup", (e) => {
      if (!this.interactive() || this.dragAnchor === null) return
      const index = this.indexFromPoint(e.x)
      this.setSelection(this.dragAnchor, index)
      this.dragAnchor = null
      this.resetCaretBlink()
      this.syncBridge()
      this.invalidateSelf({ source: "textbox.pointerUp" })
    })
    this.on("pointercancel", () => {
      this.dragAnchor = null
    })
    this.on("keydown", (e) => {
      if (!this.session.focused || !this.interactive()) return

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
    })
  }

  update(opts: {
    rect: () => Rect
    value: Signal<string>
    placeholder?: string | (() => string)
    active?: () => boolean
    disabled?: () => boolean
    visualStyle?: VisualStyleInput
    inputBridge?: TextInputBridge
  }) {
    this.rectValue = opts.rect()
    this.value = opts.value
    this.placeholderValue = typeof opts.placeholder === "function" ? opts.placeholder() : (opts.placeholder ?? "")
    this.activeValue = opts.active ? opts.active() : true
    this.disabledValue = opts.disabled ? opts.disabled() : false
    this.chromeVisualModel = { focused: this.session.focused && !this.disabledValue, visualStyle: opts.visualStyle }
    if (opts.inputBridge) this.inputBridge = opts.inputBridge
  }

  bindRuntimeState(binding: RuntimeStateBinding | undefined) {
    this.runtimeState = binding
  }

  canFocus() {
    return this.interactive()
  }

  // ... (keep rest of methods but replace rect(), active(), disabled() calls with property access)

  protected onDraw(ctx: CanvasRenderingContext2D) {
    if (!this.activeValue) return
    const rect = this.rectValue
    const disabled = this.disabledValue
    const focused = this.session.focused && !disabled
    const textValue = this.value.get()
    const placeholder = this.placeholderValue
    const display = textValue || placeholder
    const isPlaceholder = !textValue
    const innerX = rect.x + PAD_X
    const innerW = Math.max(0, rect.w - PAD_X * 2)
    const selection = this.normalizedSelection()

    this.session.scrollX = ensureTextCaretVisible(ctx, {
      value: textValue,
      rect,
      padX: PAD_X,
      scrollX: this.session.scrollX,
    }, this.session.selectionEnd, innerW)

    this.chromeVisualModel = { focused, visualStyle: this.chromeVisualModel.visualStyle }
    syncVisualHostState(this.chromeVisualHost, {
      rect,
      model: this.chromeVisualModel,
      context: {
        state: { hover: this.hover, pressed: false, dragging: this.dragAnchor !== null, disabled },
        disabled,
      },
    })
    drawVisualHost(ctx, this.chromeVisualHost, buildTextBoxChromeVisual)

    ctx.save()
    ctx.beginPath()
    ctx.rect(innerX, rect.y + 1, innerW, Math.max(0, rect.h - 2))
    ctx.clip()

    if (focused && selection.selectionStart !== selection.selectionEnd && textValue) {
      const selectionX = innerX + measureTextPrefix(ctx, textValue, selection.selectionStart) - this.session.scrollX
      const selectionW = measureTextPrefix(ctx, textValue, selection.selectionEnd) - measureTextPrefix(ctx, textValue, selection.selectionStart)
      ctx.fillStyle = theme.colors.inputSelection
      ctx.fillRect(selectionX, rect.y + 4, selectionW, rect.h - 8)
    }

    const textVisualModel: TextBoxTextVisualModel = { text: display, placeholder: isPlaceholder }
    syncVisualHostState(this.textVisualHost, {
      rect: { x: innerX - this.session.scrollX, y: rect.y, w: innerW + this.session.scrollX, h: rect.h },
      model: textVisualModel,
      context: {
        state: { hover: this.hover, pressed: false, dragging: this.dragAnchor !== null, disabled },
        disabled,
      },
    })
    drawVisualHost(ctx, this.textVisualHost, buildTextBoxTextVisual)

    if (focused && this.session.caretVisible && selection.selectionStart === selection.selectionEnd) {
      const caretX = innerX + measureTextPrefix(ctx, textValue, this.session.selectionEnd) - this.session.scrollX
      ctx.fillStyle = theme.colors.text
      ctx.fillRect(caretX, rect.y + 5, 1, rect.h - 10)
    }

    const regions = resolveTextBoxRegions({
      rect,
      padX: PAD_X,
      scrollX: this.session.scrollX,
      caretX: innerX + measureTextPrefix(ctx, textValue, this.session.selectionEnd) - this.session.scrollX,
    })
    writeRuntimeRegions(this.runtimeState, regions, {
      active: this.activeValue,
      disabled,
      focused,
      selectionStart: selection.selectionStart,
      selectionEnd: selection.selectionEnd,
      scrollX: this.session.scrollX,
    })

    ctx.restore()
  }

  private interactive() {
    return this.activeValue && !this.disabledValue
  }

  private normalizedSelection() {
    return normalizedTextSessionSelection(this.session)
  }

  private indexFromPoint(x: number) {
    const context = this.measureCtx as CanvasRenderingContext2D | null
    if (!context) return this.value.get().length
    return resolveTextIndexFromPoint(context, {
      value: this.value.get(),
      rect: this.rectValue,
      padX: PAD_X,
      scrollX: this.session.scrollX,
    }, x)
  }

  private setSelection(start: number, end: number) {
    setSessionSelection(this.session, this.value.get(), start, end)
  }

  private moveCaret(delta: number, extend: boolean) {
    moveSessionCaret(this.session, this.value.get(), delta, extend)
  }

  private moveCaretTo(next: number, extend: boolean) {
    moveSessionCaretTo(this.session, this.value.get(), next, extend)
  }

  private syncBridge() {
    if (!this.session.focused || !this.interactive()) return
    const rect = this.rectValue
    const caretRectCss = {
      x: rect.x + PAD_X,
      y: rect.y + rect.h / 2,
      w: 1,
      h: rect.h,
    }
    const state = createSessionBridgeState(
      this.value.get(),
      this.session,
      caretRectCss,
    )
    if (syncTextSessionBridge(this.inputBridge, this.sessionId, state)) return
    focusTextSessionBridge(
      this.inputBridge,
      {
        id: this.sessionId,
        onStateChange: (next: TextInputSyncState) => {
          this.value.set(next.value)
          setSessionSelection(this.session, next.value, next.selectionStart, next.selectionEnd)
          this.resetCaretBlink()
          this.invalidateSelf({ source: "textbox.bridge" })
        },
        onBlur: () => {
          blurTextSession(this.session)
          this.stopCaretBlink()
          this.invalidateSelf({ source: "textbox.bridgeBlur" })
        },
      },
      state,
    )
  }

  private isPrintableKey(e: KeyUIEvent) {
    return e.key.length === 1 && !e.ctrlKey && !e.metaKey
  }

  private resetCaretBlink() {
    this.session.caretBlinkHoldUntil = Date.now() + CARET_BLINK_MS
    this.updateCaretBlinkState(true)
    this.scheduleCaretBlink()
  }

  private stopCaretBlink() {
    if (this.caretBlinkTimer !== null) {
      clearTimeout(this.caretBlinkTimer)
      this.caretBlinkTimer = null
    }
    this.session.caretVisible = false
    this.session.caretBlinkHoldUntil = 0
  }

  private scheduleCaretBlink() {
    if (this.caretBlinkTimer !== null) clearTimeout(this.caretBlinkTimer)
    if (!this.session.focused) {
      this.caretBlinkTimer = null
      return
    }
    const now = Date.now()
    const nextAt = this.nextCaretBlinkAt(now)
    const delay = Math.max(16, nextAt - now)
    this.caretBlinkTimer = setTimeout(() => {
      this.caretBlinkTimer = null
      if (!this.session.focused) {
        this.stopCaretBlink()
        return
      }
      this.updateCaretBlinkState()
      this.scheduleCaretBlink()
    }, delay)
  }

  private nextCaretBlinkAt(now: number) {
    if (now < this.session.caretBlinkHoldUntil) return this.session.caretBlinkHoldUntil
    const elapsed = now - this.session.caretBlinkHoldUntil
    const phase = Math.floor(elapsed / CARET_BLINK_MS)
    return this.session.caretBlinkHoldUntil + (phase + 1) * CARET_BLINK_MS
  }

  updateCaretBlinkState(forceVisible = false) {
    const now = Date.now()
    const nextVisible = forceVisible || now < this.session.caretBlinkHoldUntil
      ? true
      : Math.floor((now - this.session.caretBlinkHoldUntil) / CARET_BLINK_MS) % 2 === 1
    if (this.session.caretVisible === nextVisible) return
    this.session.caretVisible = nextVisible
    this.invalidateSelf({ source: "textbox.caret" })
  }

  protected invalidationOutset() {
    return 6
  }

  protected debugRuntimeState(): DebugRuntimeStateSnapshot | null {
    const selection = this.normalizedSelection()
    return {
      title: "Text Input",
      fields: [
        { label: "active", value: String(this.activeValue) },
        { label: "disabled", value: String(this.disabledValue) },
        { label: "focused", value: String(this.session.focused) },
        { label: "selection", value: `${selection.selectionStart}-${selection.selectionEnd}` },
        { label: "scrollX", value: `${Math.round(this.session.scrollX)}` },
        { label: "bridge", value: this.inputBridge.isFocused(this.sessionId) ? "focused" : "idle" },
      ],
    }
  }

  onRuntimeDeactivate() {
    this.hover = false
    this.dragAnchor = null
    if (this.session.focused) {
      blurTextSession(this.session)
      blurTextSessionBridge(this.inputBridge, this.sessionId)
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

export const textBoxDescriptor: WidgetDescriptor<TextBoxState, TextBoxWidgetProps> = {
  id: "textbox",
  retainedKind: "widget",
  capabilityShape: { behavior: true, visual: true, layout: true },
  create: () => {
    const state = { rect: ZERO_RECT, active: false, disabled: false } as TextBoxState
    state.widget = new TextBox({
      rect: () => state.rect,
      value: signal(""),
      active: () => state.active,
      disabled: () => state.disabled,
      visualStyle: undefined,
    })
    return state
  },
  getWidget: (state) => state.widget,
  mount: (state, props: TextBoxWidgetProps, rect, active) => {
    state.rect = rect
    state.active = active
    state.disabled = props.disabled ?? false
    state.widget.bindRuntimeState(props.runtimeState)
    state.widget.update({
      rect: () => state.rect,
      value: props.behavior.value,
      placeholder: props.behavior.placeholder,
      active: () => state.active,
      disabled: () => state.disabled,
      visualStyle: props.visual?.fieldStyle,
    })
  },
}

export { TEXTBOX_HEIGHT }
