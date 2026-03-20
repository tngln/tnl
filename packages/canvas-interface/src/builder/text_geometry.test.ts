import { describe, expect, it } from "bun:test"
import { ensureTextCaretVisible, measureTextPrefix, resolveTextIndexFromPoint } from "@tnl/canvas-interface/builder"
import { fakeCtx } from "./test_utils"

describe("text geometry", () => {
  it("measures text prefix widths", () => {
    const ctx = fakeCtx()
    expect(measureTextPrefix(ctx, "hello", 0)).toBe(0)
    expect(measureTextPrefix(ctx, "hello", 3)).toBeGreaterThan(0)
  })

  it("resolves nearest text index from pointer x", () => {
    const ctx = fakeCtx()
    const index = resolveTextIndexFromPoint(ctx, {
      value: "hello",
      rect: { x: 0, y: 0, w: 120, h: 28 },
      padX: 8,
      scrollX: 0,
    }, 20)
    expect(index).toBeGreaterThanOrEqual(0)
    expect(index).toBeLessThanOrEqual(5)
  })

  it("keeps caret visible by adjusting scrollX", () => {
    const ctx = fakeCtx()
    const scrollX = ensureTextCaretVisible(ctx, {
      value: "hello world",
      rect: { x: 0, y: 0, w: 60, h: 28 },
      padX: 8,
      scrollX: 0,
    }, 11, 44)
    expect(scrollX).toBeGreaterThanOrEqual(0)
  })
})
