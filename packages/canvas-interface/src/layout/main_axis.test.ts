import { describe, expect, it } from "bun:test"
import { distributeMainAxis } from "./main_axis"

describe("main axis distribution", () => {
  it("freezes maxed items and redistributes remaining grow space", () => {
    const distribution = distributeMainAxis({
      baseSizes: [20, 20, 20],
      availableMain: 100,
      growWeights: [1, 1, 1],
      minSizes: [0, 0, 0],
      maxSizes: [30, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY],
    })

    expect(distribution.sizes[0]).toBeCloseTo(30, 6)
    expect(distribution.sizes[1]).toBeCloseTo(35, 6)
    expect(distribution.sizes[2]).toBeCloseTo(35, 6)
    expect(distribution.remainingMain).toBeCloseTo(0, 6)
  })

  it("freezes mined items and redistributes remaining shrink deficit", () => {
    const distribution = distributeMainAxis({
      baseSizes: [80, 80],
      availableMain: 100,
      shrinkWeights: [1, 1],
      minSizes: [70, 0],
      maxSizes: [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY],
    })

    expect(distribution.sizes[0]).toBeCloseTo(70, 6)
    expect(distribution.sizes[1]).toBeCloseTo(30, 6)
  })
})
