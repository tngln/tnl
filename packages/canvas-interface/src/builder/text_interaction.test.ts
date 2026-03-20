import { describe, expect, it } from "bun:test"
import { clampTextSelection, createTextBridgeState, moveTextCaret, moveTextCaretTo, moveTextSelectionState, moveTextSelectionStateTo, normalizeTextSelection, setTextSelectionState } from "@tnl/canvas-interface/builder"

describe("text interaction", () => {
  it("normalizes and clamps text selections", () => {
    expect(normalizeTextSelection(5, 2)).toEqual({ start: 2, end: 5 })
    expect(clampTextSelection("hello", -1, 99)).toEqual({ start: 0, end: 5 })
  })

  it("moves caret with and without extending selection", () => {
    expect(moveTextCaret("hello", 5, 5, -1, false)).toEqual({ start: 4, end: 4 })
    expect(moveTextCaret("hello", 1, 4, -1, false)).toEqual({ start: 1, end: 1 })
    expect(moveTextCaret("hello", 1, 1, 2, true)).toEqual({ start: 1, end: 3 })
  })

  it("moves caret to absolute targets", () => {
    expect(moveTextCaretTo("hello", 2, 5, false)).toEqual({ start: 5, end: 5 })
    expect(moveTextCaretTo("hello", 2, 5, true)).toEqual({ start: 2, end: 5 })
  })

  it("builds bridge sync state from a text selection", () => {
    expect(createTextBridgeState("hello", 4, 1, { x: 1, y: 2, w: 3, h: 4 })).toEqual({
      value: "hello",
      selectionStart: 1,
      selectionEnd: 4,
      caretRectCss: { x: 1, y: 2, w: 3, h: 4 },
    })
  })

  it("updates selection state objects directly", () => {
    expect(setTextSelectionState("hello", { selectionStart: 0, selectionEnd: 0 }, 4, 1)).toEqual({
      selectionStart: 4,
      selectionEnd: 4,
    })
    expect(moveTextSelectionState("hello", { selectionStart: 5, selectionEnd: 5 }, -1, false)).toEqual({
      selectionStart: 4,
      selectionEnd: 4,
    })
    expect(moveTextSelectionStateTo("hello", { selectionStart: 1, selectionEnd: 1 }, 4, true)).toEqual({
      selectionStart: 1,
      selectionEnd: 4,
    })
  })
})
