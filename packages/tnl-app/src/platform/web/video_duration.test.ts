import { describe, expect, it } from "bun:test"
import { resolvePlaybackDuration } from "./video_duration"

describe("video duration resolution", () => {
  it("prefers finite metadata duration when present", () => {
    const r = resolvePlaybackDuration(12.5, 0, null)
    expect(r.duration).toBe(12.5)
    expect(r.source).toBe("metadata")
  })

  it("uses recovered duration for non-finite metadata", () => {
    const r = resolvePlaybackDuration(Number.POSITIVE_INFINITY, 0, 7.2)
    expect(r.duration).toBe(7.2)
    expect(r.source).toBe("recovered")
  })

  it("falls back to seekable range when metadata is unbounded", () => {
    const r = resolvePlaybackDuration(Number.POSITIVE_INFINITY, 9.1, null)
    expect(r.duration).toBe(9.1)
    expect(r.source).toBe("seekable")
  })

  it("reports unknown when neither metadata nor seekable range is finite", () => {
    const r = resolvePlaybackDuration(Number.POSITIVE_INFINITY, 0, null)
    expect(r.duration).toBe(0)
    expect(r.source).toBe("unknown")
  })
})
