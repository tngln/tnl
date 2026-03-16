import { describe, expect, it } from "bun:test"
import { TabPanelSurface } from "./tab_panel_surface"
import { fakeCtx } from "../builder/test_utils"

function findNodeByType(node: any, type: string): any | null {
  if (node?.type === type) return node
  for (const child of node?.children ?? []) {
    const hit = findNodeByType(child, type)
    if (hit) return hit
  }
  return null
}

describe("tab panel surface", () => {
  it("keeps the scrollbar above the content viewport", () => {
    const tallSurface = {
      id: "Tall.Surface",
      render: () => {},
      contentSize: () => ({ x: 160, y: 480 }),
    }

    const surface = new TabPanelSurface({
      id: "Tabs.Test",
      tabs: [{ id: "a", title: "Alpha", surface: tallSurface }],
      scrollbar: true,
    })

    surface.render(fakeCtx(), {
      rect: { x: 0, y: 0, w: 180, h: 140 },
      contentRect: { x: 0, y: 0, w: 180, h: 140 },
      clip: false,
      scroll: { x: 0, y: 0 },
      toSurface: (p) => p,
      dpr: 1,
    })

    const snapshot = surface.debugSnapshot()
    const viewportNode = findNodeByType(snapshot, "ViewportElement")
    const scrollbarNode = findNodeByType(snapshot, "Scrollbar")

    expect(viewportNode).toBeDefined()
    expect(scrollbarNode).toBeDefined()
    expect((scrollbarNode?.z ?? -1)).toBeGreaterThan(viewportNode?.z ?? -1)
  })
})