import { describe, expect, it } from "bun:test"
import { CanvasUI, CursorRegion, UIElement, type Rect } from "./ui"
import { pointerEvent, withFakeDom } from "./test_utils"

class CaptureElement extends UIElement {
  moves = 0
  cancels: string[] = []
  focused = false
  blurred = false

  constructor() {
    super()
    this.on("pointerdown", (e) => {
      e.capture()
    })
    this.on("pointermove", () => {
      this.moves += 1
    })
    this.on("pointercancel", ({ reason }) => {
      this.cancels.push(reason)
    })
    this.on("focus", () => {
      this.focused = true
      this.blurred = false
    })
    this.on("blur", () => {
      this.focused = false
      this.blurred = true
    })
  }

  bounds(): Rect {
    return { x: 0, y: 0, w: 80, h: 80 }
  }

  canFocus() {
    return true
  }
}

class RootElement extends UIElement {
  constructor(child: UIElement) {
    super()
    this.add(child)
  }

  bounds(): Rect {
    return { x: -1000, y: -1000, w: 2000, h: 2000 }
  }
}

class CursorElement extends UIElement {
  constructor(bounds: Rect, cursor: "ew-resize" | "nwse-resize") {
    super()
    this.add(
      new CursorRegion({
        rect: () => bounds,
        cursor,
      }),
    )
  }

  bounds(): Rect {
    return { x: 0, y: 0, w: 100, h: 100 }
  }
}

class ParentCaptureElement extends UIElement {
  constructor() {
    super()
    const childHost = new NestedCursorHost()
    childHost.z = 1
    this.add(childHost)
    this.on("pointerdown", (e) => {
      e.capturePointer()
    })
  }

  bounds(): Rect {
    return { x: 0, y: 0, w: 100, h: 100 }
  }
}

class NestedCursorHost extends UIElement {
  constructor() {
    super()
    this.add(
      new CursorRegion({
        rect: () => ({ x: 70, y: 70, w: 20, h: 20 }),
        cursor: "nwse-resize",
      }),
    )
  }

  bounds(): Rect {
    return { x: 70, y: 70, w: 20, h: 20 }
  }
}

class OverlappingCursorElement extends UIElement {
  constructor() {
    super()
    const lower = new CursorRegion({
      rect: () => ({ x: 10, y: 10, w: 40, h: 40 }),
      cursor: "ew-resize",
    })
    lower.z = 1
    const higher = new CursorRegion({
      rect: () => ({ x: 10, y: 10, w: 40, h: 40 }),
      cursor: "nwse-resize",
    })
    higher.z = 2
    this.add(lower)
    this.add(higher)
  }

  bounds(): Rect {
    return { x: 0, y: 0, w: 100, h: 100 }
  }
}

class OcclusionLayer extends UIElement {
  bounds(): Rect {
    return { x: 0, y: 0, w: 100, h: 100 }
  }
}

class OcclusionCursorRoot extends UIElement {
  constructor() {
    super()
    const lower = new CursorElement({ x: 70, y: 70, w: 20, h: 20 }, "nwse-resize")
    lower.z = 1
    const upper = new OcclusionLayer()
    upper.z = 2
    this.add(lower)
    this.add(upper)
  }

  bounds(): Rect {
    return { x: -1000, y: -1000, w: 2000, h: 2000 }
  }
}

describe("canvas ui pointer cancel", () => {
  it("cancels active capture on pointercancel and clears capture", () => {
    withFakeDom({ canvasRect: { width: 200, height: 120 }, includeDocumentCreateElement: false, trackPointerCapture: true }, ({ canvas, windowHost }) => {
      const target = new CaptureElement()
      const ui = new CanvasUI(canvas, new RootElement(target))

      ;(canvas as any).dispatch("pointerdown", pointerEvent(10, 10, 1))
      ;(canvas as any).dispatch("pointercancel", pointerEvent(10, 10, 0))
      ;(canvas as any).dispatch("pointermove", pointerEvent(150, 10, 1))

      expect(target.cancels).toEqual(["pointercancel"])
      expect(target.moves).toBe(0)
      expect((canvas as any).__releasedPointerId()).toBe(1)

      ui.destroy()
      windowHost.dispatch("blur")
    })
  })

  it("cancels active capture on browser blur and removes listeners on destroy", () => {
    withFakeDom({ canvasRect: { width: 200, height: 120 }, includeDocumentCreateElement: false, trackPointerCapture: true }, ({ canvas, windowHost }) => {
      const target = new CaptureElement()
      const ui = new CanvasUI(canvas, new RootElement(target))

      ;(canvas as any).dispatch("pointerdown", pointerEvent(10, 10, 1))
      expect(ui.focusTarget).toBe(target)
      windowHost.dispatch("blur")
      ;(canvas as any).dispatch("pointermove", pointerEvent(150, 10, 1))

      expect(target.cancels).toEqual(["blur"])
      expect(target.moves).toBe(0)
      expect(target.blurred).toBe(true)
      expect(ui.focusTarget).toBe(null)

      ui.destroy()
      windowHost.dispatch("blur")
      expect(target.cancels).toEqual(["blur"])
    })
  })

  it("applies cursor from hovered cursor regions and restores default when leaving", () => {
    withFakeDom({ canvasRect: { width: 200, height: 120 }, includeDocumentCreateElement: false }, ({ canvas }) => {
      const root = new RootElement(new CursorElement({ x: 20, y: 20, w: 30, h: 30 }, "ew-resize"))
      const ui = new CanvasUI(canvas, root)

      ;(canvas as any).dispatch("pointermove", pointerEvent(25, 25, 0))
      expect((canvas as any).style.cursor).toBe("ew-resize")

      ;(canvas as any).dispatch("pointermove", pointerEvent(160, 25, 0))
      expect((canvas as any).style.cursor).toBe("default")

      ui.destroy()
    })
  })

  it("prefers the top-most cursor region when regions overlap", () => {
    withFakeDom({ canvasRect: { width: 200, height: 120 }, includeDocumentCreateElement: false }, ({ canvas }) => {
      const ui = new CanvasUI(canvas, new RootElement(new OverlappingCursorElement()))

      ;(canvas as any).dispatch("pointermove", pointerEvent(20, 20, 0))
      expect((canvas as any).style.cursor).toBe("nwse-resize")

      ui.destroy()
    })
  })

  it("does not adopt a cursor from an occluded sibling", () => {
    withFakeDom({ canvasRect: { width: 200, height: 120 }, includeDocumentCreateElement: false }, ({ canvas }) => {
      const root = new OcclusionCursorRoot()
      const ui = new CanvasUI(canvas, root)

      ;(canvas as any).dispatch("pointermove", pointerEvent(75, 75, 0))
      expect((canvas as any).style.cursor).toBe("default")

      ui.destroy()
    })
  })

  it("keeps the active cursor during capture and resets on destroy", () => {
    withFakeDom({ canvasRect: { width: 200, height: 120 }, includeDocumentCreateElement: false, trackPointerCapture: true }, ({ canvas }) => {
      const target = new CaptureElement()
      target.add(
        new CursorRegion({
          rect: () => ({ x: 0, y: 0, w: 80, h: 80 }),
          cursor: "nwse-resize",
        }),
      )
      const ui = new CanvasUI(canvas, new RootElement(target))

      ;(canvas as any).dispatch("pointerdown", pointerEvent(10, 10, 1))
      ;(canvas as any).dispatch("pointermove", pointerEvent(150, 10, 1))
      expect((canvas as any).style.cursor).toBe("nwse-resize")

      ui.destroy()
      expect((canvas as any).style.cursor).toBe("default")
    })
  })

  it("clears focus on destroy", () => {
    withFakeDom({ canvasRect: { width: 200, height: 120 }, includeDocumentCreateElement: false }, ({ canvas }) => {
      const target = new CaptureElement()
      const ui = new CanvasUI(canvas, new RootElement(target))

      ;(canvas as any).dispatch("pointerdown", pointerEvent(10, 10, 1))
      expect(ui.focusTarget).toBe(target)

      ui.destroy()

      expect(target.blurred).toBe(true)
      expect(ui.focusTarget).toBe(null)
    })
  })

  it("does not adopt a descendant cursor when a parent capture target has no capture cursor", () => {
    withFakeDom({ canvasRect: { width: 200, height: 120 }, includeDocumentCreateElement: false }, ({ canvas }) => {
      const ui = new CanvasUI(canvas, new RootElement(new ParentCaptureElement()))

      ;(canvas as any).dispatch("pointerdown", pointerEvent(10, 10, 1))
      ;(canvas as any).dispatch("pointermove", pointerEvent(150, 10, 1))

      expect((canvas as any).style.cursor).toBe("default")

      ui.destroy()
    })
  })
})
