import { clamp } from "../builder/utils"

export type TextSelection = {
  start: number
  end: number
}

export type TextSelectionState = {
  selectionStart: number
  selectionEnd: number
}

export function clampTextSelection(value: string, start: number, end: number): TextSelection {
  const max = value.length
  const selectionStart = Math.max(0, Math.min(max, start))
  const selectionEnd = Math.max(selectionStart, Math.min(max, end))
  return { start: selectionStart, end: selectionEnd }
}

export function normalizeTextSelection(a: number, b: number): TextSelection {
  return {
    start: Math.min(a, b),
    end: Math.max(a, b),
  }
}

export function collapseSelection(selection: TextSelection, direction: "start" | "end") {
  const caret = direction === "start" ? selection.start : selection.end
  return { start: caret, end: caret }
}

export function moveTextCaret(value: string, currentStart: number, currentEnd: number, delta: number, extend: boolean): TextSelection {
  const normalized = normalizeTextSelection(currentStart, currentEnd)
  if (!extend && normalized.start !== normalized.end) {
    return collapseSelection(normalized, delta < 0 ? "start" : "end")
  }
  const anchor = extend ? currentStart : currentEnd
  const next = clamp(currentEnd + delta, 0, value.length)
  return extend ? clampTextSelection(value, anchor, next) : { start: next, end: next }
}

export function moveTextCaretTo(value: string, currentStart: number, target: number, extend: boolean): TextSelection {
  const next = clamp(target, 0, value.length)
  return extend ? clampTextSelection(value, currentStart, next) : { start: next, end: next }
}

export function createTextBridgeState(value: string, selectionStart: number, selectionEnd: number, caretRectCss: { x: number; y: number; w: number; h: number }) {
  const selection = normalizeTextSelection(selectionStart, selectionEnd)
  return {
    value,
    selectionStart: selection.start,
    selectionEnd: selection.end,
    caretRectCss,
  }
}

export function setTextSelectionState(value: string, _current: TextSelectionState, start: number, end: number): TextSelectionState {
  const next = clampTextSelection(value, start, end)
  return {
    selectionStart: next.start,
    selectionEnd: next.end,
  }
}

export function collapseTextSelectionState(current: TextSelectionState, direction: "start" | "end" = "end"): TextSelectionState {
  const collapsed = collapseSelection(normalizeTextSelection(current.selectionStart, current.selectionEnd), direction)
  return {
    selectionStart: collapsed.start,
    selectionEnd: collapsed.end,
  }
}

export function moveTextSelectionState(value: string, current: TextSelectionState, delta: number, extend: boolean): TextSelectionState {
  const next = moveTextCaret(value, current.selectionStart, current.selectionEnd, delta, extend)
  return {
    selectionStart: next.start,
    selectionEnd: next.end,
  }
}

export function moveTextSelectionStateTo(value: string, current: TextSelectionState, target: number, extend: boolean): TextSelectionState {
  const next = moveTextCaretTo(value, current.selectionStart, target, extend)
  return {
    selectionStart: next.start,
    selectionEnd: next.end,
  }
}
