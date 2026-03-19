import { describe, expect, it } from "bun:test"
import { JobScheduler } from "./scheduler"

describe("render job scheduler", () => {
  it("prioritizes scrub over playback ahead", () => {
    const s = new JobScheduler()
    s.enqueue({ frame: 200, fps: 30, budgetMs: 33, quality: "full", reason: "playback", targetFrame: 100, target: { w: 640, h: 360 } })
    s.enqueue({ frame: 150, fps: 30, budgetMs: 33, quality: "full", reason: "scrub", targetFrame: 150, target: { w: 640, h: 360 } })
    const next = s.takeNext()
    expect(next?.reason).toBe("scrub")
    expect(next?.frame).toBe(150)
  })

  it("prefers jobs closer to targetFrame within the same reason", () => {
    const s = new JobScheduler()
    s.enqueue({ frame: 110, fps: 30, budgetMs: 33, quality: "full", reason: "playback", targetFrame: 100, target: { w: 640, h: 360 } })
    s.enqueue({ frame: 101, fps: 30, budgetMs: 33, quality: "full", reason: "playback", targetFrame: 100, target: { w: 640, h: 360 } })
    const next = s.takeNext()
    expect(next?.frame).toBe(101)
  })
})

