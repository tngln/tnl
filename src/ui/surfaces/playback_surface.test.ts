import { describe, expect, it } from "bun:test"
import { createTimecodeToolSurface, buildPlaybackStateLabel } from "./timecode_surface"
import { formatPlaybackTime } from "./playback_surface"
import { formatTimecode } from "../playback/timecode"

describe("playback surface helpers", () => {
  it("formats playback time for mm:ss and hh:mm:ss", () => {
    expect(formatPlaybackTime(9)).toBe("00:09")
    expect(formatPlaybackTime(125)).toBe("02:05")
    expect(formatPlaybackTime(3661)).toBe("1:01:01")
  })

  it("formats timecode with frame suffix", () => {
    expect(formatTimecode(1, 24)).toBe("00:00:01+00")
    expect(formatTimecode(1 + 12 / 24, 24)).toBe("00:00:01+12")
  })

  it("formats the timecode playback state label", () => {
    expect(buildPlaybackStateLabel(true, 1)).toBe("Playing · 1.00x")
    expect(buildPlaybackStateLabel(false, 0.5)).toBe("Paused · 0.50x")
  })

  it("mounts timecode as a builder surface", () => {
    const surface = createTimecodeToolSurface()
    expect(surface.id).toBe("Timecode.Surface")
    expect(typeof surface.render).toBe("function")
    expect(typeof surface.contentSize).toBe("function")
  })
})