import { describe, expect, it } from "bun:test"
import { signal } from "../../core/reactivity"
import { KeyUIEvent, PointerUIEvent } from "../base/ui"
import { TextBox } from "./textbox"
import type { OnePxTextboxBridge, OnePxTextboxSession, OnePxTextboxSyncState } from "../../platform/web"

function fakeCtx() {
  let font = "400 12px system-ui"
  return {
    get font() {
      return font
    },
    set font(value: string) {
      font = value
    },
    measureText(text: string) {
      const size = /(\d+(?:\.\d+)?)px/.exec(font)
      const px = size ? parseFloat(size[1]) : 12
      return { width: text.length * px * 0.6 }
    },
  } as unknown as CanvasRenderingContext2D
}

function withFakeDocument<T>(run: () => T) {
  const previousDocument = (globalThis as any).document
  ;(globalThis as any).document = {
    createElement() {
      return {
        getContext() {
          return fakeCtx()
        },
      }
    },
  }
  try {
    return run()
  } finally {
    ;(globalThis as any).document = previousDocument
  }
}

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
    const value = signal("abc")
    const bridge = new MockBridge()
    const textbox = new TextBox({
      rect: () => ({ x: 0, y: 0, w: 120, h: 28 }),
      value,
      inputBridge: bridge,
    })

    textbox.onFocus()
    expect(bridge.states.at(-1)).toMatchObject({ value: "abc", selectionStart: 0, selectionEnd: 0 })

    bridge.session?.onStateChange({ value: "abcd", selectionStart: 4, selectionEnd: 4 })
    expect(value.get()).toBe("abcd")
    expect(bridge.session).toBeTruthy()
  })

  it("handles navigation and select-all locally while consuming clipboard shortcuts", () => {
    const value = signal("hello")
    const bridge = new MockBridge()
    const textbox = new TextBox({
      rect: () => ({ x: 0, y: 0, w: 120, h: 28 }),
      value,
      inputBridge: bridge,
    })

    textbox.onFocus()
    bridge.session?.onStateChange({ value: "hello", selectionStart: 5, selectionEnd: 5 })

    const left = key("ArrowLeft", "ArrowLeft")
    textbox.onKeyDown(left)
    expect(left.didConsume).toBe(true)
    expect(left.didPreventDefault).toBe(true)
    expect(bridge.states.at(-1)).toMatchObject({ selectionStart: 4, selectionEnd: 4 })

    const selectAll = key("KeyA", "a", { ctrlKey: true })
    textbox.onKeyDown(selectAll)
    expect(selectAll.didPreventDefault).toBe(true)
    expect(bridge.states.at(-1)).toMatchObject({ selectionStart: 0, selectionEnd: 5 })

    const copy = key("KeyC", "c", { ctrlKey: true })
    textbox.onKeyDown(copy)
    expect(copy.didConsume).toBe(true)
    expect(copy.didPreventDefault).toBe(false)
  })

  it("supports pointer selection dragging", () => {
    withFakeDocument(() => {
      const value = signal("hello")
      const bridge = new MockBridge()
      const textbox = new TextBox({
        rect: () => ({ x: 0, y: 0, w: 120, h: 28 }),
        value,
        inputBridge: bridge,
      })

      textbox.onFocus()
      textbox.onPointerDown(pointer(8, 1))
      textbox.onPointerMove(pointer(36, 1))
      textbox.onPointerUp(pointer(36, 0))

      expect(bridge.states.at(-1)?.selectionEnd).toBeGreaterThan(bridge.states.at(-1)?.selectionStart ?? 0)
    })
  })

  it("does not focus when disabled", () => {
    const value = signal("hello")
    const bridge = new MockBridge()
    const textbox = new TextBox({
      rect: () => ({ x: 0, y: 0, w: 120, h: 28 }),
      value,
      disabled: () => true,
      inputBridge: bridge,
    })

    expect(textbox.canFocus()).toBe(false)
    textbox.onFocus()
    expect(bridge.session).toBe(null)
  })
})
