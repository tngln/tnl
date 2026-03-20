import { describe, expect, it } from "bun:test"
import { blurTextSession, blurTextSessionBridge, createSessionBridgeState, createTextSessionState, focusTextSession, focusTextSessionBridge, moveSessionCaret, moveSessionCaretTo, normalizedTextSessionSelection, setSessionSelection, syncTextSessionBridge } from "@tnl/canvas-interface/builder"

describe("text session", () => {
  it("tracks focus and normalized selection", () => {
    const session = createTextSessionState()
    focusTextSession(session)
    setSessionSelection(session, "hello", 4, 1)
    expect(session.focused).toBe(true)
    expect(normalizedTextSessionSelection(session)).toEqual({ selectionStart: 4, selectionEnd: 4 })
  })

  it("moves session caret and collapses on blur", () => {
    const session = createTextSessionState()
    focusTextSession(session)
    setSessionSelection(session, "hello", 1, 1)
    moveSessionCaret(session, "hello", 2, true)
    expect(session.selectionEnd).toBe(3)
    moveSessionCaretTo(session, "hello", 5, false)
    expect(session.selectionStart).toBe(5)
    expect(session.selectionEnd).toBe(5)
    blurTextSession(session)
    expect(session.focused).toBe(false)
  })

  it("builds bridge state from a session", () => {
    const session = createTextSessionState()
    focusTextSession(session)
    setSessionSelection(session, "hello", 1, 3)
    expect(createSessionBridgeState("hello", session, { x: 1, y: 2, w: 3, h: 4 })).toEqual({
      value: "hello",
      selectionStart: 1,
      selectionEnd: 3,
      caretRectCss: { x: 1, y: 2, w: 3, h: 4 },
    })
  })

  it("drives text bridge helpers through a common interface", () => {
    const calls: string[] = []
    const bridge = {
      focus() { calls.push("focus") },
      sync() { calls.push("sync") },
      blur() { calls.push("blur") },
      isFocused(sessionId: string) { return sessionId === "focused" },
    }
    const state = createSessionBridgeState("hello", createTextSessionState(), { x: 0, y: 0, w: 1, h: 1 })
    focusTextSessionBridge(bridge as any, { id: "session", onStateChange() {}, onBlur() {} }, state as any)
    expect(syncTextSessionBridge(bridge as any, "idle", state as any)).toBe(false)
    expect(syncTextSessionBridge(bridge as any, "focused", state as any)).toBe(true)
    blurTextSessionBridge(bridge as any, "session")
    expect(calls).toEqual(["focus", "sync", "blur"])
  })
})
