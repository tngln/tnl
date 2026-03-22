import { describe, expect, it } from "bun:test"
import { Compositor } from "@tnl/canvas-interface/ui"
import { fakeContext, withFakeDom } from "./test_utils"

describe("compositor debug", () => {
  it("lists layers and records blits per frame", () => {
    withFakeDom({ includeDocumentCreateElement: true }, () => {
      const comp = new Compositor()
      const main = fakeContext()
      comp.beginFrame(main, 1)

      comp.debugTagLayer("surface:test", { surfaceId: "test", viewportRect: { x: 10, y: 20, w: 100, h: 80 } })
      comp.withLayer("surface:test", 100, 80, 2, () => {})
      comp.blit("surface:test", { x: 10, y: 20, w: 100, h: 80 }, { opacity: 0.75, blendMode: "source-over" })

      const layers = comp.debugListLayers()
      expect(layers.length).toBe(1)
      expect(layers[0]?.id).toBe("surface:test")
      expect(layers[0]?.wCss).toBe(100)
      expect(layers[0]?.hCss).toBe(80)
      expect(layers[0]?.dpr).toBe(2)
      expect(layers[0]?.wPx).toBe(200)
      expect(layers[0]?.hPx).toBe(160)
      expect(layers[0]?.estimatedBytes).toBe(200 * 160 * 4)
      expect(layers[0]?.tag?.surfaceId).toBe("test")

      const blits = comp.debugGetFrameBlits()
      expect(blits.length).toBe(1)
      expect(blits[0]).toEqual({
        frameId: 1,
        layerId: "surface:test",
        dest: { x: 10, y: 20, w: 100, h: 80 },
        opacity: 0.75,
        blendMode: "source-over",
      })

      comp.beginFrame(main, 2)
      expect(comp.debugGetFrameBlits().length).toBe(0)
    })
  })
})
