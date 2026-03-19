import { describe, expect, it } from "bun:test"
import { TabPanelSurface } from "./tab_panel_surface"

function fakeCtx() {
  let font = "400 12px system-ui"
  const ctx: any = {
    canvas: { width: 800, height: 600 },
    get font() {
      return font
    },
    set font(v: string) {
      font = v
    },
    textAlign: "start",
    textBaseline: "alphabetic",
    fillStyle: "#000",
    strokeStyle: "#000",
    lineWidth: 1,
    lineCap: "butt",
    lineJoin: "miter",
    shadowColor: "transparent",
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    save() {},
    restore() {},
    beginPath() {},
    rect() {},
    clip() {},
    translate() {},
    roundRect() {},
    fillRect() {},
    strokeRect() {},
    fill() {},
    stroke() {},
    arc() {},
    moveTo() {},
    lineTo() {},
    setLineDash() {},
    fillText() {},
    measureText(text: string) {
      const m = /(\d+(?:\.\d+)?)px/.exec(font)
      const size = m ? parseFloat(m[1]) : 12
      return { width: text.length * size * 0.6, actualBoundingBoxAscent: size * 0.8, actualBoundingBoxDescent: size * 0.2 }
    },
    getTransform() {
      return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }
    },
  }
  return ctx as CanvasRenderingContext2D
}

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
