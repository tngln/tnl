import { describe, expect, it } from "bun:test"
import { AutoQualityController } from "./auto_quality"

describe("auto quality controller", () => {
  it("degrades to proxy after consecutive late frames", () => {
    const q = new AutoQualityController({ degradeAfterLateFrames: 2, recoverAfterOnTimeFrames: 5 })
    expect(q.snapshot().mode).toBe("full")
    q.observeFrame({ late: true })
    expect(q.snapshot().mode).toBe("full")
    q.observeFrame({ late: true })
    expect(q.snapshot().mode).toBe("proxy")
  })

  it("recovers to full after consecutive on-time frames", () => {
    const q = new AutoQualityController({ degradeAfterLateFrames: 1, recoverAfterOnTimeFrames: 3 })
    q.observeFrame({ late: true })
    expect(q.snapshot().mode).toBe("proxy")
    q.observeFrame({ late: false })
    q.observeFrame({ late: false })
    expect(q.snapshot().mode).toBe("proxy")
    q.observeFrame({ late: false })
    expect(q.snapshot().mode).toBe("full")
  })
})

