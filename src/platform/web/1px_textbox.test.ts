import { describe, expect, it } from "bun:test"
import { get1pxTextboxBridge, reset1pxTextboxBridgeForTests } from "./1px_textbox"

type ListenerMap = Map<string, Set<(event?: any) => void>>

function createInputHost() {
  const listeners: ListenerMap = new Map()
  return {
    id: "",
    type: "",
    value: "",
    autocomplete: "",
    spellcheck: false,
    selectionStart: 0,
    selectionEnd: 0,
    style: {} as Record<string, string>,
    addEventListener(type: string, listener: (event?: any) => void) {
      let bucket = listeners.get(type)
      if (!bucket) {
        bucket = new Set()
        listeners.set(type, bucket)
      }
      bucket.add(listener)
    },
    dispatch(type: string) {
      for (const listener of listeners.get(type) ?? []) listener({})
    },
    setSelectionRange(start: number, end: number) {
      this.selectionStart = start
      this.selectionEnd = end
    },
    focus() {},
    blur() {
      this.dispatch("blur")
    },
  }
}

function withFakeDocument<T>(run: (input: ReturnType<typeof createInputHost>) => T) {
  const previousDocument = (globalThis as any).document
  const input = createInputHost()
  ;(globalThis as any).document = {
    body: {
      appendChild() {},
    },
    getElementById(id: string) {
      return id === "tnl-1px-textbox" ? input : null
    },
    createElement() {
      return input
    },
  }
  try {
    reset1pxTextboxBridgeForTests()
    return run(input)
  } finally {
    reset1pxTextboxBridgeForTests()
    ;(globalThis as any).document = previousDocument
  }
}

describe("1px textbox bridge", () => {
  it("focuses and syncs value and selection", () => {
    withFakeDocument((input) => {
      const bridge = get1pxTextboxBridge()
      let focused = 0
      input.focus = () => {
        focused += 1
      }
      bridge.focus(
        {
          id: "session",
          onStateChange() {},
        },
        { value: "hello", selectionStart: 1, selectionEnd: 4, caretRectCss: { x: 10, y: 20, w: 1, h: 18 } },
      )

      return new Promise<void>((resolve) => {
        setTimeout(() => {
          expect(input.value).toBe("hello")
          expect(input.selectionStart).toBe(1)
          expect(input.selectionEnd).toBe(4)
          expect(input.style.left).toBe("10px")
          expect(bridge.isFocused("session")).toBe(true)
          expect(focused).toBe(1)
          resolve()
        }, 0)
      })
    })
  })

  it("forwards input and select events to the active session", () => {
    withFakeDocument((input) => {
      const bridge = get1pxTextboxBridge()
      const states: Array<{ value: string; selectionStart: number; selectionEnd: number }> = []
      bridge.focus(
        {
          id: "session-events",
          onStateChange(next) {
            states.push(next)
          },
        },
        { value: "abc", selectionStart: 3, selectionEnd: 3 },
      )

      input.value = "abcd"
      input.selectionStart = 4
      input.selectionEnd = 4
      input.dispatch("input")
      input.selectionStart = 1
      input.selectionEnd = 2
      input.dispatch("select")

      expect(states).toEqual([
        { value: "abcd", selectionStart: 4, selectionEnd: 4 },
        { value: "abcd", selectionStart: 1, selectionEnd: 2 },
      ])
    })
  })

  it("clears the session on blur", () => {
    withFakeDocument((input) => {
      const bridge = get1pxTextboxBridge()
      let blurred = 0
      bridge.focus(
        {
          id: "session-blur",
          onStateChange() {},
          onBlur() {
            blurred += 1
          },
        },
        { value: "", selectionStart: 0, selectionEnd: 0 },
      )

      input.blur()

      expect(blurred).toBe(1)
      expect(bridge.isFocused("session-blur")).toBe(false)
    })
  })
})
