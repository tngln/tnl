import { describe, expect, it } from "bun:test"
import { OpfsError, normalizePath } from "./opfs"

describe("opfs", () => {
  it("normalizes path and removes redundant segments", () => {
    expect(normalizePath("media//a.mp4")).toBe("media/a.mp4")
    expect(normalizePath("./media/./a.mp4")).toBe("media/a.mp4")
    expect(normalizePath("a/b/c.txt")).toBe("a/b/c.txt")
  })

  it("rejects invalid paths", () => {
    expect(() => normalizePath("")).toThrow(OpfsError)
    expect(() => normalizePath("/abs.txt")).toThrow(OpfsError)
    expect(() => normalizePath("../x")).toThrow(OpfsError)
    expect(() => normalizePath("a/../b")).toThrow(OpfsError)
  })
})

