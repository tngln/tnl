import { describe, expect, it } from "bun:test"
import { resolveDropdownRegions, resolveTextBoxRegions, resolveTreeRowRegions } from "@tnl/canvas-interface/builder"

describe("widget regions", () => {
  it("computes tree row disclosure region from rect and depth", () => {
    const regions = resolveTreeRowRegions({
      rect: { x: 10, y: 4, w: 200, h: 22 },
      depth: 2,
    })
    expect(regions.primaryRect).toEqual({ x: 10, y: 4, w: 200, h: 22 })
    expect(regions.disclosureRect.w).toBe(12)
    expect(regions.disclosureRect.h).toBe(12)
  })

  it("computes dropdown anchor and overlay regions", () => {
    const regions = resolveDropdownRegions({
      rect: { x: 0, y: 0, w: 140, h: 28 },
      optionCount: 3,
    })
    expect(regions.anchorRect).toEqual({ x: 0, y: 0, w: 140, h: 28 })
    expect(regions.overlayRect).toEqual({ x: 0, y: 30, w: 140, h: 66 })
  })

  it("computes textbox content and caret anchor regions", () => {
    const regions = resolveTextBoxRegions({
      rect: { x: 0, y: 0, w: 120, h: 28 },
      padX: 8,
      scrollX: 4,
      caretX: 20,
    })
    expect(regions.contentRect).toEqual({ x: 8, y: 1, w: 104, h: 26 })
    expect(regions.focusRegion).toEqual({ x: 8, y: 0, w: 104, h: 28 })
    expect(regions.anchorRect).toEqual({ x: 20, y: 5, w: 1, h: 18 })
  })
})
