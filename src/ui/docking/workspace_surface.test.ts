import { describe, expect, it } from "bun:test"
import { resolveDockDropPreview } from "./workspace_surface"

describe("dock workspace drop resolution", () => {
  it("prefers the adjacent leaf edge when hovering near a shared boundary", () => {
    const preview = resolveDockDropPreview(
      "Dock.Container.1",
      { x: 800, y: 400 },
      [
        { leafId: "left", rect: { x: 0, y: 0, w: 395, h: 400 } },
        { leafId: "right", rect: { x: 405, y: 0, w: 395, h: 400 } },
      ],
      { x: 402, y: 200 },
    )

    expect(preview?.leafId).toBe("right")
    expect(preview?.placement).toBe("left")
  })

  it("still resolves center when the pointer is well inside a leaf", () => {
    const preview = resolveDockDropPreview(
      "Dock.Container.1",
      { x: 800, y: 400 },
      [{ leafId: "only", rect: { x: 0, y: 0, w: 800, h: 400 } }],
      { x: 400, y: 200 },
    )

    expect(preview?.leafId).toBe("only")
    expect(preview?.placement).toBe("center")
  })

  it("falls back to an empty-container center target when there are no leaves", () => {
    const preview = resolveDockDropPreview("Dock.Container.1", { x: 800, y: 400 }, [], { x: 120, y: 80 })

    expect(preview).toEqual({
      containerId: "Dock.Container.1",
      leafId: null,
      placement: "center",
      rect: { x: 0, y: 0, w: 800, h: 400 },
    })
  })
})
