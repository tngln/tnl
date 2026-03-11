import { describe, expect, it } from "bun:test"
import { signal } from "../../core/reactivity"
import { PointerUIEvent } from "../base/ui"
import { TopLayerController } from "../base/top_layer"
import { Dropdown } from "./dropdown"

function pointer(x: number, y: number, buttons = 1) {
  return new PointerUIEvent({
    pointerId: 1,
    x,
    y,
    button: 0,
    buttons,
    altKey: false,
    ctrlKey: false,
    shiftKey: false,
    metaKey: false,
  })
}

describe("dropdown", () => {
  it("does not change selection when disabled", () => {
    const selected = signal("A")
    const topLayer = new TopLayerController({ rect: () => ({ x: -1e9, y: -1e9, w: 2e9, h: 2e9 }), invalidate: () => {}, z: 0 })
    const dd = new Dropdown({
      id: "test",
      rect: () => ({ x: 0, y: 0, w: 140, h: 28 }),
      options: [
        { value: "A", label: "A" },
        { value: "B", label: "B" },
      ],
      selected,
      topLayer,
      disabled: () => true,
    })

    dd.onPointerEnter()
    dd.onPointerDown(pointer(10, 10))
    dd.onPointerUp(pointer(10, 10))

    expect(selected.peek()).toBe("A")
    expect(topLayer.hasAny()).toBe(false)
  })

  it("opens and selects an option from the menu", () => {
    const selected = signal("A")
    const topLayer = new TopLayerController({ rect: () => ({ x: -1e9, y: -1e9, w: 2e9, h: 2e9 }), invalidate: () => {}, z: 0 })
    const dd = new Dropdown({
      id: "test",
      rect: () => ({ x: 0, y: 0, w: 140, h: 28 }),
      options: [
        { value: "A", label: "Option A" },
        { value: "B", label: "Option B" },
        { value: "C", label: "Option C" },
      ],
      selected,
      topLayer,
    })

    dd.onPointerEnter()
    dd.onPointerDown(pointer(10, 10))
    dd.onPointerUp(pointer(10, 10))
    expect(topLayer.hasAny()).toBe(true)

    const menuY = 28 + 2
    const rowH = 22
    const yInB = menuY + rowH * 1 + 10

    const hit = topLayer.host.hitTest({ x: 10, y: yInB }) as any
    expect(hit).toBeTruthy()
    hit.onPointerEnter()
    hit.onPointerMove(pointer(10, yInB, 0))
    hit.onPointerDown(pointer(10, yInB))
    hit.onPointerUp(pointer(10, yInB))

    expect(selected.peek()).toBe("B")
    expect(topLayer.hasAny()).toBe(false)
  })

  it("closes when blurred", () => {
    const selected = signal("A")
    const topLayer = new TopLayerController({ rect: () => ({ x: -1e9, y: -1e9, w: 2e9, h: 2e9 }), invalidate: () => {}, z: 0 })
    const dd = new Dropdown({
      id: "test",
      rect: () => ({ x: 0, y: 0, w: 140, h: 28 }),
      options: [
        { value: "A", label: "A" },
        { value: "B", label: "B" },
      ],
      selected,
      topLayer,
    })

    dd.onPointerEnter()
    dd.onPointerDown(pointer(10, 10))
    dd.onPointerUp(pointer(10, 10))
    expect(topLayer.hasAny()).toBe(true)

    dd.onBlur()
    expect(topLayer.hasAny()).toBe(false)
  })
})
