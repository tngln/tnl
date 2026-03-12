import { describe, expect, it } from "bun:test"
import { UIElement } from "./ui"
import { ViewportElement } from "./viewport"

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
  bounds() {
    return { x: 0, y: 0, w: 10, h: 10 }
  }

  onPointerDown() {}
}

class ClickElement extends UIElement {
  bounds() {
    return { x: 0, y: 0, w: 10, h: 10 }
  }

  protected debugListeners() {
    return [{ id: "click", label: "Click" }]
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
})
