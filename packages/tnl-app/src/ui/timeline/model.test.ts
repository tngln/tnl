import { describe, expect, it } from "bun:test"
import {
  computeHorizontalScrollLimit,
  computeTrackMetrics,
  computeVerticalScrollLimit,
  createGenericNumericUnitAdapter,
  findVisibleTrackRange,
  itemIntersectsRange,
  valueToX,
  xToValue,
  zoomAroundPointer,
} from "./model"

describe("timeline model", () => {
  it("keeps valueToX and xToValue inverse across scroll space", () => {
    const rangeStart = 100
    const pxPerUnit = 3.5
    const values = [100, 120.5, 183.25, 240]
    for (const value of values) {
      const x = valueToX(value, rangeStart, pxPerUnit)
      expect(xToValue(x, rangeStart, pxPerUnit)).toBeCloseTo(value, 8)
    }
  })

  it("preserves pointer anchor when zooming", () => {
    const nextScrollX = zoomAroundPointer({
      pointerX: 180,
      viewportWidth: 640,
      rangeStart: 0,
      scrollX: 320,
      pxPerUnit: 4,
      nextPxPerUnit: 10,
      zoomAnchorMode: "pointer",
    })
    const anchorValue = xToValue(320 + 180, 0, 4)
    expect(valueToX(anchorValue, 0, 10) - nextScrollX).toBeCloseTo(180, 8)
  })

  it("requires viewport-local pointer x instead of scrolled content x", () => {
    const scrollX = 320
    const viewportLocalX = 180
    const scrolledContentX = scrollX + viewportLocalX
    const nextScrollX = zoomAroundPointer({
      pointerX: viewportLocalX,
      viewportWidth: 640,
      rangeStart: 0,
      scrollX,
      pxPerUnit: 4,
      nextPxPerUnit: 10,
      zoomAnchorMode: "pointer",
    })
    const anchorValue = xToValue(scrolledContentX, 0, 4)
    expect(valueToX(anchorValue, 0, 10) - nextScrollX).toBeCloseTo(viewportLocalX, 8)
  })

  it("returns stable tick steps as zoom changes", () => {
    const adapter = createGenericNumericUnitAdapter(1)
    const coarse = adapter.getTickStep(1)
    const fine = adapter.getTickStep(12)
    expect(coarse.minor).toBeGreaterThanOrEqual(1)
    expect(coarse.major).toBeGreaterThanOrEqual(coarse.minor)
    expect(coarse.label).toBeGreaterThanOrEqual(coarse.major)
    expect(fine.minor).toBeLessThanOrEqual(coarse.minor)
  })

  it("computes scroll limits from content size", () => {
    expect(computeHorizontalScrollLimit(0, 200, 4, 300)).toBe(500)
    expect(computeHorizontalScrollLimit(0, 50, 4, 400)).toBe(0)
    expect(computeVerticalScrollLimit(300, 120)).toBe(180)
    expect(computeVerticalScrollLimit(100, 200)).toBe(0)
  })

  it("finds visible tracks and filters intersecting items", () => {
    const { metrics } = computeTrackMetrics(
      [
        { id: "a", name: "A", items: [], height: 40 },
        { id: "b", name: "B", items: [], height: 50 },
        { id: "c", name: "C", items: [], height: 60 },
      ],
      { defaultTrackHeight: 44, trackGap: 6 },
    )
    expect(findVisibleTrackRange(20, 70, metrics)).toEqual({ first: 0, last: 1 })
    expect(itemIntersectsRange({ id: "i", start: 10, duration: 20, label: "x" }, 0, 12)).toBe(true)
    expect(itemIntersectsRange({ id: "i", start: 40, duration: 10, label: "x" }, 0, 20)).toBe(false)
  })
})
