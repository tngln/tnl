import { describe, expect, it } from "bun:test"
import { signal } from "@tnl/canvas-interface/reactivity"
import { PointerUIEvent, TopLayerController } from "@tnl/canvas-interface/ui"
import { Dropdown } from "@tnl/canvas-interface/widgets"
import { fakeCtx } from "../builder/test_utils"

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
    const selected = signal("A", { debugLabel: "test.dropdown.selected" })
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

    dd.emit("pointerenter")
    dd.emit("pointerdown", pointer(10, 10))
    dd.emit("pointerup", pointer(10, 10))

    expect(selected.peek()).toBe("A")
    expect(topLayer.hasAny()).toBe(false)
  })

  it("opens and selects an option from the menu", () => {
    const selected = signal("A", { debugLabel: "test.dropdown.selected" })
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

    dd.emit("pointerenter")
    dd.emit("pointerdown", pointer(10, 10))
    dd.emit("pointerup", pointer(10, 10))
    expect(topLayer.hasAny()).toBe(true)

    const menuY = 28 + 2
    const rowH = 22
    const yInB = menuY + rowH * 1 + 10

    const hit = topLayer.host.hitTest({ x: 10, y: yInB }) as any
    expect(hit).toBeTruthy()
    hit.emit("pointerenter")
    hit.emit("pointermove", pointer(10, yInB, 0))
    hit.emit("pointerdown", pointer(10, yInB))
    hit.emit("pointerup", pointer(10, yInB))

    expect(selected.peek()).toBe("B")
    expect(topLayer.hasAny()).toBe(false)
  })

  it("closes when blurred", () => {
    const selected = signal("A", { debugLabel: "test.dropdown.selected" })
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

    dd.emit("pointerenter")
    dd.emit("pointerdown", pointer(10, 10))
    dd.emit("pointerup", pointer(10, 10))
    expect(topLayer.hasAny()).toBe(true)

    dd.emit("blur")
    expect(topLayer.hasAny()).toBe(false)
  })

  it("draws the closed trigger through the shared visual layer", () => {
    const selected = signal("B", { debugLabel: "test.dropdown.draw.selected" })
    const topLayer = new TopLayerController({ rect: () => ({ x: -1e9, y: -1e9, w: 2e9, h: 2e9 }), invalidate: () => {}, z: 0 })
    const dd = new Dropdown({
      id: "draw",
      rect: () => ({ x: 0, y: 0, w: 140, h: 28 }),
      options: [
        { value: "A", label: "Option A" },
        { value: "B", label: "Option B" },
      ],
      selected,
      topLayer,
    })
    const ctx = fakeCtx() as CanvasRenderingContext2D & { calls: Array<{ op: string; args: any[] }> }

    dd.draw(ctx)

    expect(ctx.calls.some((call) => call.op === "fillText" && call.args[0] === "Option B")).toBe(true)
  })
})
