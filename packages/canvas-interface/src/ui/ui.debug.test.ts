import { describe, expect, it } from "bun:test"
import { UIElement, ViewportElement } from "@tnl/canvas-interface/ui"

class BoxElement extends UIElement {
  constructor(private readonly rect: { x: number; y: number; w: number; h: number }, private readonly label: string) {
    super()
  }

  bounds() {
    return this.rect
  }

  protected debugDescribe() {
    return {
      kind: "element" as const,
      type: "BoxElement",
      label: this.label,
      bounds: this.rect,
      z: this.z,
      visible: this.visible,
    }
  }
}

class PointerElement extends UIElement {
  constructor() {
    super()
    this.on("pointerdown", () => {})
  }

  bounds() {
    return { x: 0, y: 0, w: 10, h: 10 }
  }
}

class ClickElement extends UIElement {
  bounds() {
    return { x: 0, y: 0, w: 10, h: 10 }
  }

  protected debugListeners() {
    return [{ id: "click", label: "Click" }]
  }
}

class RuntimeElement extends UIElement {
  bounds() {
    return { x: 0, y: 0, w: 10, h: 10 }
  }

  protected debugRuntimeState() {
    return {
      title: "Runtime",
      fields: [{ label: "mode", value: "active" }],
    }
  }
}

describe("ui debug snapshots", () => {
  it("includes viewport targets as surface nodes in the tree", () => {
    const root = new BoxElement({ x: 0, y: 0, w: 320, h: 180 }, "Root")
    const viewport = new ViewportElement({
      rect: () => ({ x: 10, y: 12, w: 120, h: 80 }),
      target: {
        id: "Demo.Surface",
        render() {},
      },
    })

    root.add(viewport)

    const snapshot = root.debugSnapshot()
    expect(snapshot.children).toHaveLength(1)
    expect(snapshot.children[0].label).toBe("Viewport -> Demo.Surface")
    expect(snapshot.children[0].children[0]).toMatchObject({
      kind: "surface",
      id: "Demo.Surface",
      label: "Demo.Surface",
    })
  })

  it("translates surface debug bounds into canvas coordinates", () => {
    const root = new BoxElement({ x: 0, y: 0, w: 320, h: 180 }, "Root")
    const viewport = new ViewportElement({
      rect: () => ({ x: 10, y: 12, w: 120, h: 80 }),
      target: {
        id: "Debug.Surface",
        render() {},
        debugSnapshot() {
          return {
            kind: "surface",
            type: "DebugSurface",
            label: "Debug.Surface",
            bounds: { x: 0, y: 0, w: 40, h: 30 },
            children: [
              {
                kind: "element",
                type: "LocalNode",
                label: "Local",
                bounds: { x: 5, y: 6, w: 10, h: 8 },
                children: [],
              },
            ],
          }
        },
      },
      options: {
        padding: 4,
        scroll: { x: 3, y: 2 },
      },
    })

    root.add(viewport)

    const snapshot = root.debugSnapshot()
    const surface = snapshot.children[0].children[0]!
    expect(surface.bounds).toEqual({ x: 11, y: 14, w: 40, h: 30 })
    expect(surface.children[0]?.bounds).toEqual({ x: 16, y: 20, w: 10, h: 8 })
  })

  it("includes debug listeners for elements", () => {
    const root = new BoxElement({ x: 0, y: 0, w: 320, h: 180 }, "Root")
    const pointer = new PointerElement()
    const click = new ClickElement()
    root.add(pointer)
    root.add(click)

    const snapshot = root.debugSnapshot()
    expect(snapshot.children).toHaveLength(2)
    expect(snapshot.children[0].listeners?.map((l) => l.id)).toEqual(["pointer.down"])
    expect(snapshot.children[1].listeners?.map((l) => l.id)).toEqual(["click"])
  })

  it("includes runtime state in debug snapshots", () => {
    const root = new BoxElement({ x: 0, y: 0, w: 320, h: 180 }, "Root")
    root.add(new RuntimeElement())

    const snapshot = root.debugSnapshot()
    expect(snapshot.children[0].runtime).toEqual({
      title: "Runtime",
      fields: [{ label: "mode", value: "active" }],
    })
  })
})
