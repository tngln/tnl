import { describe, expect, it } from "bun:test"
import { buildAcceptString, inferContainerFromPath, inferMimeCandidates, isAviPath } from "./media_formats"

describe("media formats", () => {
  it("infers containers from paths", () => {
    expect(inferContainerFromPath("a/b/c.webm")).toBe("webm")
    expect(inferContainerFromPath("a/b/c.MP4")).toBe("mp4")
    expect(inferContainerFromPath("a/b/c.avi")).toBe("avi")
    expect(inferContainerFromPath("a/b/c.jpeg")).toBe("jpeg")
    expect(inferContainerFromPath("a/b/c")).toBe("unknown")
  })

  it("builds accept strings", () => {
    expect(buildAcceptString("video")).toContain(".webm")
    expect(buildAcceptString("video")).toContain(".avi")
    expect(buildAcceptString("audio")).toContain(".mp3")
    expect(buildAcceptString("image")).toContain(".png")
  })

  it("infers mime candidates with blobType first", () => {
    const out = inferMimeCandidates("x.avi", "video/x-msvideo")
    expect(out[0]).toBe("video/x-msvideo")
    expect(out).toContain("video/avi")
    expect(isAviPath("x.avi")).toBe(true)
  })
})

