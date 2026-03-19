import { describe, expect, it } from "bun:test"
import { ControlElement } from "@tnl/canvas-interface/builder"
import { PointerUIEvent } from "@tnl/canvas-interface/ui"
import { drawButton } from "./draw_controls"
import { fakeCtx } from "./test_utils"

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

  it("renders button visualStyle and leading icon through visual fragments", () => {
    const ctx = fakeCtx() as CanvasRenderingContext2D & { calls: Array<{ op: string; args: any[] }> }
    drawButton(
      ctx,
      { x: 0, y: 0, w: 120, h: 32 },
      {
        text: "Run",
        leadingIcon: "+",
        visualStyle: {
          base: {
            border: { color: null, radius: 10 },
            effects: { shadow: { color: "rgba(0,0,0,0.30)", blur: 6, offsetY: 2 } },
          },
        },
      },
      { hover: false, pressed: false, dragging: false, disabled: false },
    )

    const fillTextCalls = ctx.calls.filter((call) => call.op === "fillText")
    expect(fillTextCalls.map((call) => call.args[0])).toContain("+")
    expect(fillTextCalls.map((call) => call.args[0])).toContain("Run")
    expect(ctx.calls.some((call) => call.op === "strokeRect")).toBe(false)
  })
})
