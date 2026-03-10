import { describe, expect, it } from "bun:test"
import { FrameRingBuffer } from "./ring_buffer"

describe("render ring buffer", () => {
  it("hits and misses by (frame,quality)", () => {
    const buf = new FrameRingBuffer<{ id: string }>({ capacity: 3 })
    expect(buf.get(10, "full")).toBeNull()
    buf.put({ frame: 10, quality: "full", bitmap: { id: "a" } })
    expect(buf.get(10, "full")?.bitmap.id).toBe("a")
    expect(buf.get(10, "proxy")).toBeNull()
    const stats = buf.snapshotStats()
    expect(stats.hits).toBe(1)
    expect(stats.misses).toBe(2)
  })

  it("evicts least-recently-used when over capacity", () => {
    const closed: string[] = []
    const buf = new FrameRingBuffer<{ id: string }>({ capacity: 2 })
    buf.put({ frame: 1, quality: "full", bitmap: { id: "a" }, close: () => closed.push("a") })
    buf.put({ frame: 2, quality: "full", bitmap: { id: "b" }, close: () => closed.push("b") })
    // Touch frame 1 so frame 2 becomes LRU.
    expect(buf.get(1, "full")?.bitmap.id).toBe("a")
    buf.put({ frame: 3, quality: "full", bitmap: { id: "c" }, close: () => closed.push("c") })
    expect(buf.get(2, "full")).toBeNull()
    expect(buf.get(1, "full")?.bitmap.id).toBe("a")
    expect(buf.get(3, "full")?.bitmap.id).toBe("c")
    expect(closed).toEqual(["b"])
    expect(buf.snapshotStats().evictions).toBe(1)
  })

  it("replaces an existing entry and closes the old one", () => {
    const closed: string[] = []
    const buf = new FrameRingBuffer<{ id: string }>({ capacity: 2 })
    buf.put({ frame: 1, quality: "full", bitmap: { id: "a" }, close: () => closed.push("a") })
    buf.put({ frame: 1, quality: "full", bitmap: { id: "b" }, close: () => closed.push("b") })
    expect(buf.get(1, "full")?.bitmap.id).toBe("b")
    expect(closed).toEqual(["a"])
  })
})

