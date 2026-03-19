import { describe, expect, it } from "bun:test"
import { ControlElement } from "@tnl/canvas-interface/builder"
import { PointerUIEvent } from "@tnl/canvas-interface/ui"

function pointer() {
  return new PointerUIEvent({
    pointerId: 1,
    x: 8,
    y: 8,
    button: 0,
    buttons: 1,
    altKey: false,
    ctrlKey: false,
    shiftKey: false,
    metaKey: false,
  })
}

describe("button", () => {
  it("does not invoke onClick when disabled", () => {
    let clicks = 0
    const button = new ControlElement()
    button.update({
      rect: { x: 0, y: 0, w: 80, h: 24 },
      active: true,
      disabled: true,
      draw: () => {},
      onClick: () => {
        clicks += 1
      },
    })

    button.emit("pointerenter")
    button.emit("pointerdown", pointer())
    button.emit("pointerup", pointer())

    expect(clicks).toBe(0)
  })

  it("invokes onClick when enabled", () => {
    let clicks = 0
    const button = new ControlElement()
    button.update({
      rect: { x: 0, y: 0, w: 80, h: 24 },
      active: true,
      disabled: false,
      draw: () => {},
      onClick: () => {
        clicks += 1
      },
    })

    button.emit("pointerenter")
    button.emit("pointerdown", pointer())
    button.emit("pointerup", pointer())

    expect(clicks).toBe(1)
  })

  it("requests invalidation when hover state changes", () => {
    let invalidations = 0
    const button = new ControlElement()
    button.update({
      rect: { x: 0, y: 0, w: 80, h: 24 },
      active: true,
      disabled: false,
      draw: () => {},
    })

    button.draw({} as CanvasRenderingContext2D, {
      frameId: 1,
      dpr: 1,
      invalidateRect: () => {
        invalidations += 1
      },
    })

    button.emit("pointerenter")
    button.emit("pointerleave")

    expect(invalidations).toBe(2)
  })
})
