import { describe, expect, it } from "bun:test"
import { NodeRuntimeStateStore, writeRuntimeRegions, writeRuntimeState, type RuntimeStateBinding } from "@tnl/canvas-interface/builder"

describe("runtime state store", () => {
  it("writes and reads structured region snapshots", () => {
    const store = new NodeRuntimeStateStore()
    const binding: RuntimeStateBinding = { key: "node.a", store }

    writeRuntimeRegions(binding, {
      primaryRect: { x: 0, y: 0, w: 100, h: 30 },
      contentRect: { x: 8, y: 2, w: 84, h: 26 },
      anchorRect: { x: 90, y: 10, w: 1, h: 10 },
      hitRegions: {
        disclosure: { x: 4, y: 4, w: 12, h: 12 },
      },
    }, {
      active: true,
      hover: true,
    })

    expect(store.read<any>("node.a")).toEqual({
      primaryRect: { x: 0, y: 0, w: 100, h: 30 },
      contentRect: { x: 8, y: 2, w: 84, h: 26 },
      anchorRect: { x: 90, y: 10, w: 1, h: 10 },
      hitRegions: {
        disclosure: { x: 4, y: 4, w: 12, h: 12 },
      },
      active: true,
      hover: true,
    })
  })

  it("still supports direct state snapshot writes", () => {
    const store = new NodeRuntimeStateStore()
    const binding: RuntimeStateBinding = { key: "node.b", store }
    writeRuntimeState(binding, {
      primaryRect: { x: 0, y: 0, w: 10, h: 10 },
      active: true,
      focused: true,
    } as any)
    expect(store.read<any>("node.b")?.focused).toBe(true)
  })
})
