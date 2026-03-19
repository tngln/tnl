import { describe, expect, it } from "bun:test"
import { resolvePlaybackDuration } from "./playback"

describe("playback duration resolution", () => {
  it("prefers finite metadata duration when present", () => {
    expect(resolvePlaybackDuration(12.5, 12.4, null)).toEqual({
      duration: 12.5,
      source: "metadata",
      rawDuration: 12.5,
      seekableEnd: 12.4,
    })
  })

  it("uses recovered duration for non-finite metadata", () => {
    expect(resolvePlaybackDuration(Number.POSITIVE_INFINITY, 0, 8.75)).toEqual({
      duration: 8.75,
      source: "recovered",
      rawDuration: Number.POSITIVE_INFINITY,
      seekableEnd: 0,
    })
  })

  it("falls back to seekable range when metadata is unbounded", () => {
    expect(resolvePlaybackDuration(Number.POSITIVE_INFINITY, 5.5, null)).toEqual({
      duration: 5.5,
      source: "seekable",
      rawDuration: Number.POSITIVE_INFINITY,
      seekableEnd: 5.5,
    })
  })

  it("reports unknown when neither metadata nor seekable range is finite", () => {
    expect(resolvePlaybackDuration(Number.POSITIVE_INFINITY, 0, null)).toEqual({
      duration: 0,
      source: "unknown",
      rawDuration: Number.POSITIVE_INFINITY,
      seekableEnd: 0,
    })
  })
})