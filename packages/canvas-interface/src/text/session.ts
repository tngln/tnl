import { createTextBridgeState, moveTextSelectionState, moveTextSelectionStateTo, normalizeTextSelection, setTextSelectionState } from "./interaction"

export type TextSessionState = {
  focused: boolean
  selectionStart: number
  selectionEnd: number
  scrollX: number
  caretVisible: boolean
  caretBlinkHoldUntil: number
}

export type TextBridgeSessionState = {
  value: string
  selectionStart: number
  selectionEnd: number
  caretRectCss: { x: number; y: number; w: number; h: number }
}

export type TextBridgeLike<TSessionState extends TextBridgeSessionState = TextBridgeSessionState> = {
  focus(
    session: {
      id: string
      onStateChange: (next: TSessionState) => void
      onBlur: () => void
    },
    state: TSessionState,
  ): void
  sync(sessionId: string, state: TSessionState): void
  blur(sessionId: string): void
  isFocused(sessionId: string): boolean
}

export function createTextSessionState(): TextSessionState {
  return {
    focused: false,
    selectionStart: 0,
    selectionEnd: 0,
    scrollX: 0,
    caretVisible: false,
    caretBlinkHoldUntil: 0,
  }
}

export function normalizedTextSessionSelection(state: TextSessionState) {
  const selection = normalizeTextSelection(state.selectionStart, state.selectionEnd)
  return {
    selectionStart: selection.start,
    selectionEnd: selection.end,
  }
}

export function focusTextSession(state: TextSessionState) {
  state.focused = true
}

export function blurTextSession(state: TextSessionState) {
  state.focused = false
  const collapsed = Math.max(state.selectionStart, state.selectionEnd)
  state.selectionStart = collapsed
  state.selectionEnd = collapsed
}

export function setSessionSelection(state: TextSessionState, value: string, start: number, end: number) {
  const next = setTextSelectionState(value, state, start, end)
  state.selectionStart = next.selectionStart
  state.selectionEnd = next.selectionEnd
}

export function moveSessionCaret(state: TextSessionState, value: string, delta: number, extend: boolean) {
  const next = moveTextSelectionState(value, state, delta, extend)
  state.selectionStart = next.selectionStart
  state.selectionEnd = next.selectionEnd
}

export function moveSessionCaretTo(state: TextSessionState, value: string, target: number, extend: boolean) {
  const next = moveTextSelectionStateTo(value, state, target, extend)
  state.selectionStart = next.selectionStart
  state.selectionEnd = next.selectionEnd
}

export function createSessionBridgeState(value: string, state: TextSessionState, caretRectCss: { x: number; y: number; w: number; h: number }) {
  return createTextBridgeState(value, state.selectionStart, state.selectionEnd, caretRectCss)
}

export function syncTextSessionBridge<TSessionState extends TextBridgeSessionState>(
  bridge: TextBridgeLike<TSessionState>,
  sessionId: string,
  state: TSessionState,
) {
  if (!bridge.isFocused(sessionId)) return false
  bridge.sync(sessionId, state)
  return true
}

export function focusTextSessionBridge<TSessionState extends TextBridgeSessionState>(
  bridge: TextBridgeLike<TSessionState>,
  session: {
    id: string
    onStateChange: (next: TSessionState) => void
    onBlur: () => void
  },
  state: TSessionState,
) {
  bridge.focus(session, state)
}

export function blurTextSessionBridge(bridge: TextBridgeLike, sessionId: string) {
  bridge.blur(sessionId)
}
