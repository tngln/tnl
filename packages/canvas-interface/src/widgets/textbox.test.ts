import { describe, expect, it } from "bun:test"
import { signal } from "@tnl/canvas-interface/reactivity"
import { KeyUIEvent, PointerUIEvent } from "@tnl/canvas-interface/ui"
import { TextBox } from "@tnl/canvas-interface/widgets"
import type { OnePxTextboxBridge, OnePxTextboxSession, OnePxTextboxSyncState } from "./../platform/web/1px_textbox"
import { withFakeDocument } from "../builder/test_utils"

class MockBridge implements OnePxTextboxBridge {
  session: OnePxTextboxSession | null = null
  states: OnePxTextboxSyncState[] = []

  focus(session: OnePxTextboxSession, state: OnePxTextboxSyncState) {
    this.session = session
    this.states.push(state)
  }

  sync(sessionId: string, state: OnePxTextboxSyncState) {
    if (this.session?.id !== sessionId) return
    this.states.push(state)
  }

  blur(sessionId: string) {
    if (this.session?.id !== sessionId) return
    this.session = null
  }

  isFocused(sessionId: string) {
    return this.session?.id === sessionId
  }

  debugInput() {
    return null
  }
}

function pointer(x: number, buttons: number) {
  return new PointerUIEvent({
    pointerId: 1,
    x,
    y: 10,
    button: 0,
    buttons,
    altKey: false,
    ctrlKey: false,
    shiftKey: false,
    metaKey: false,
  })
}

function key(code: string, keyValue = code, opts: Partial<{ ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }> = {}) {
  return new KeyUIEvent({
    code,
    key: keyValue,
    repeat: false,
    altKey: false,
    ctrlKey: !!opts.ctrlKey,
    shiftKey: !!opts.shiftKey,
    metaKey: !!opts.metaKey,
  })
}

describe("textbox", () => {
  it("syncs focus and text changes through the hidden input bridge", () => {
    const value = signal("abc", { debugLabel: "test.textbox.value" })
    const bridge = new MockBridge()
    const textbox = new TextBox({
      rect: () => ({ x: 0, y: 0, w: 120, h: 28 }),
      value,
      inputBridge: bridge,
    })

    textbox.emit("focus")
    expect(bridge.states.at(-1)).toMatchObject({ value: "abc", selectionStart: 0, selectionEnd: 0 })

    bridge.session?.onStateChange({ value: "abcd", selectionStart: 4, selectionEnd: 4 })
    expect(value.get()).toBe("abcd")
    expect(bridge.session).toBeTruthy()
  })

  it("handles navigation and select-all locally while consuming clipboard shortcuts", () => {
    const value = signal("hello", { debugLabel: "test.textbox.value" })
    const bridge = new MockBridge()
    const textbox = new TextBox({
      rect: () => ({ x: 0, y: 0, w: 120, h: 28 }),
      value,
      inputBridge: bridge,
    })

    textbox.emit("focus")
    bridge.session?.onStateChange({ value: "hello", selectionStart: 5, selectionEnd: 5 })

    const left = key("ArrowLeft", "ArrowLeft")
    textbox.emit("keydown", left)
    expect(left.didConsume).toBe(true)
    expect(left.didPreventDefault).toBe(true)
    expect(bridge.states.at(-1)).toMatchObject({ selectionStart: 4, selectionEnd: 4 })

    const selectAll = key("KeyA", "a", { ctrlKey: true })
    textbox.emit("keydown", selectAll)
    expect(selectAll.didPreventDefault).toBe(true)
    expect(bridge.states.at(-1)).toMatchObject({ selectionStart: 0, selectionEnd: 5 })

    const copy = key("KeyC", "c", { ctrlKey: true })
    textbox.emit("keydown", copy)
    expect(copy.didConsume).toBe(true)
    expect(copy.didPreventDefault).toBe(false)
  })

  it("supports pointer selection dragging", () => {
    withFakeDocument(() => {
      const value = signal("hello", { debugLabel: "test.textbox.value" })
      const bridge = new MockBridge()
      const textbox = new TextBox({
        rect: () => ({ x: 0, y: 0, w: 120, h: 28 }),
        value,
        inputBridge: bridge,
      })

      textbox.emit("focus")
      textbox.emit("pointerdown", pointer(8, 1))
      textbox.emit("pointermove", pointer(36, 1))
      textbox.emit("pointerup", pointer(36, 0))

      expect(bridge.states.at(-1)?.selectionEnd).toBeGreaterThan(bridge.states.at(-1)?.selectionStart ?? 0)
    })
  })

  it("does not focus when disabled", () => {
    const value = signal("hello", { debugLabel: "test.textbox.value" })
    const bridge = new MockBridge()
    const textbox = new TextBox({
      rect: () => ({ x: 0, y: 0, w: 120, h: 28 }),
      value,
      disabled: () => true,
      inputBridge: bridge,
    })

    expect(textbox.canFocus()).toBe(false)
    textbox.emit("focus")
    expect(bridge.session).toBe(null)
  })

  it("releases the input bridge when deactivated by the host runtime", () => {
    const value = signal("hello", { debugLabel: "test.textbox.value" })
    const bridge = new MockBridge()
    const textbox = new TextBox({
      rect: () => ({ x: 0, y: 0, w: 120, h: 28 }),
      value,
      inputBridge: bridge,
    })

    textbox.emit("focus")
    expect(bridge.session).toBeTruthy()

    textbox.onRuntimeDeactivate()

    expect(bridge.session).toBe(null)
  })
})
