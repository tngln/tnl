import { describe, expect, it } from "bun:test"
import { writeTextToClipboard } from "./clipboard"

function withFakeDocument<T>(run: (state: { copies: string[] }) => T) {
  const previousDocument = (globalThis as any).document
  const previousNavigator = (globalThis as any).navigator
  const state = { copies: [] as string[] }
  ;(globalThis as any).navigator = {}
  ;(globalThis as any).document = {
    body: {
      appendChild() {},
    },
    createElement(tag: string) {
      if (tag !== "textarea") throw new Error("expected textarea")
      return {
        value: "",
        readOnly: true,
        wrap: "off",
        style: {} as Record<string, string>,
        focus() {},
        select() {},
        remove() {},
      }
    },
    execCommand(cmd: string) {
      if (cmd !== "copy") return false
      return true
    },
  }
  try {
    return run(state)
  } finally {
    ;(globalThis as any).document = previousDocument
    ;(globalThis as any).navigator = previousNavigator
  }
}

describe("clipboard helper", () => {
  it("falls back to execCommand(copy) when navigator.clipboard is unavailable", async () => {
    await withFakeDocument(async () => {
      const ok = await writeTextToClipboard("hello")
      expect(ok).toBe(true)
    })
  })
})

