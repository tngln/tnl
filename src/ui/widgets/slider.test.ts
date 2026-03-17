import { describe, expect, it } from "bun:test"
import { resolveSliderThumbRect, resolveSliderValueFromPointer } from "@tnl/canvas-interface/builder"

describe("slider", () => {
  it("resolves value from horizontal pointer position", () => {
    const value = resolveSliderValueFromPointer(
      { x: 0, y: 0, w: 100, h: 20 },
      { min: 0, max: 10, value: 0 },
      { x: 75, y: 10 },
    )

    expect(value).toBeGreaterThan(6)
    expect(value).toBeLessThan(9)
  })

  it("clamps vertical pointer values and inverts the axis", () => {
    const value = resolveSliderValueFromPointer(
      { x: 0, y: 0, w: 20, h: 100 },
      { axis: "y", min: 0, max: 10, value: 0 },
      { x: 10, y: 5 },
    )

    expect(value).toBe(10)
  })

  it("resolves thumb rect from the current value", () => {
    const thumb = resolveSliderThumbRect(
      { x: 0, y: 0, w: 100, h: 20 },
      { min: 0, max: 10, value: 5 },
    )

    expect(thumb.x).toBe(44)
    expect(thumb.w).toBe(12)
  })
})
