import { describe, expect, it } from "bun:test"
import { get1pxTextareaBridge, reset1pxTextareaBridgeForTests } from "./1px_textarea"

type ListenerMap = Map<string, Set<(event?: any) => void>>

function createTextareaHost() {
  const listeners: ListenerMap = new Map()
  return {
    id: "",
    value: "",
    autocomplete: "",
    spellcheck: false,
    readOnly: true,
    wrap: "off",
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

function withFakeDocument<T>(run: (textarea: ReturnType<typeof createTextareaHost>) => T) {
  const previousDocument = (globalThis as any).document
  const textarea = createTextareaHost()
  ;(globalThis as any).document = {
    body: {
      appendChild() {},
    },
    getElementById(id: string) {
      return id === "tnl-1px-textarea" ? textarea : null
    },
    createElement() {
      return textarea
    },
  }
  try {
    reset1pxTextareaBridgeForTests()
    return run(textarea)
  } finally {
    reset1pxTextareaBridgeForTests()
    ;(globalThis as any).document = previousDocument
  }
}

describe("1px textarea bridge", () => {
  it("focuses and syncs value and selection", () => {
    withFakeDocument((textarea) => {
      const bridge = get1pxTextareaBridge()
      let focused = 0
      textarea.focus = () => {
        focused += 1
      }
      bridge.focus(
        {
          id: "session",
          onStateChange() {},
        },
        { value: "hello\nworld", selectionStart: 1, selectionEnd: 9, caretRectCss: { x: 10, y: 20, w: 1, h: 18 } },
      )

      return new Promise<void>((resolve) => {
        setTimeout(() => {
          expect(textarea.value).toBe("hello\nworld")
          expect(textarea.selectionStart).toBe(1)
          expect(textarea.selectionEnd).toBe(9)
          expect(textarea.style.left).toBe("10px")
          expect(bridge.isFocused("session")).toBe(true)
          expect(focused).toBe(1)
          resolve()
        }, 0)
      })
    })
  })

  it("forwards select events to the active session", () => {
    withFakeDocument((textarea) => {
      const bridge = get1pxTextareaBridge()
      const states: Array<{ value: string; selectionStart: number; selectionEnd: number }> = []
      bridge.focus(
        {
          id: "session-events",
          onStateChange(next) {
            states.push(next)
          },
        },
        { value: "abc\ndef", selectionStart: 0, selectionEnd: 0 },
      )

      textarea.selectionStart = 2
      textarea.selectionEnd = 5
      textarea.dispatch("select")

      expect(states).toEqual([{ value: "abc\ndef", selectionStart: 2, selectionEnd: 5 }])
    })
  })

  it("clears the session on blur", () => {
    withFakeDocument((textarea) => {
      const bridge = get1pxTextareaBridge()
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

      textarea.blur()

      expect(blurred).toBe(1)
      expect(bridge.isFocused("session-blur")).toBe(false)
    })
  })

  it("does not echo synthetic select notifications triggered by sync", () => {
    withFakeDocument((textarea) => {
      const bridge = get1pxTextareaBridge()
      let calls = 0
      bridge.focus(
        {
          id: "session-sync",
          onStateChange() {
            calls += 1
          },
        },
        { value: "hello\nworld", selectionStart: 0, selectionEnd: 0 },
      )

      bridge.sync("session-sync", { value: "hello\nworld", selectionStart: 1, selectionEnd: 3 })
      textarea.dispatch("select")

      expect(calls).toBe(0)
      expect(textarea.selectionStart).toBe(1)
      expect(textarea.selectionEnd).toBe(3)
    })
  })
})

