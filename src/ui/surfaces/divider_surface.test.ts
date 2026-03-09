import { describe, expect, it } from "bun:test"
import { PointerUIEvent } from "../base/ui"
import { DividerSurface } from "./divider_surface"

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

function fakeContext() {
  return {
    save() {},
    restore() {},
    beginPath() {},
    rect() {},
    roundRect() {},
    clip() {},
    fillRect() {},
    fill() {},
    stroke() {},
    setTransform() {},
    getTransform() {
      return { a: 1, d: 1 }
    },
    setLineDash() {},
    clearRect() {},
    translate() {},
    drawImage() {},
    globalCompositeOperation: "source-over",
    globalAlpha: 1,
  } as unknown as CanvasRenderingContext2D
}

describe("divider surface", () => {
  it("keeps dragging after the pointer leaves the divider handle hit area", () => {
    const surface = new DividerSurface({
      id: "test-divider",
      a: {
        id: "left",
        render() {},
      },
      b: {
        id: "right",
        render() {},
      },
      initial: 220,
      minA: 140,
      minB: 140,
      gutter: 10,
    })

    surface.render(fakeContext(), {
      rect: { x: 0, y: 0, w: 400, h: 200 },
      contentRect: { x: 0, y: 0, w: 400, h: 200 },
      clip: true,
      scroll: { x: 0, y: 0 },
      toSurface: (p) => p,
      dpr: 1,
    })

    const handle = surface.hitTest({ x: 225, y: 100 })
    expect(handle).not.toBeNull()

    handle?.onPointerEnter()
    handle?.onPointerDown(pointer(225, 100))
    handle?.onPointerLeave()
    handle?.onPointerMove(pointer(260, 100))
    handle?.onPointerUp(pointer(260, 100, 0))

    expect(surface.hitTest({ x: 225, y: 100 })).not.toBe(handle)
    expect(surface.hitTest({ x: 260, y: 100 })).toBe(handle)
  })

  it("cancels dragging on pointer cancel", () => {
    const surface = new DividerSurface({
      id: "test-divider-cancel",
      a: { id: "left", render() {} },
      b: { id: "right", render() {} },
      initial: 220,
      minA: 140,
      minB: 140,
      gutter: 10,
    })

    surface.render(fakeContext(), {
      rect: { x: 0, y: 0, w: 400, h: 200 },
      contentRect: { x: 0, y: 0, w: 400, h: 200 },
      clip: true,
      scroll: { x: 0, y: 0 },
      toSurface: (p) => p,
      dpr: 1,
    })

    const handle = surface.hitTest({ x: 225, y: 100 })
    expect(handle).not.toBeNull()

    handle?.onPointerEnter()
    handle?.onPointerDown(pointer(225, 100))
    handle?.onPointerCancel(null, "blur")
    handle?.onPointerMove(pointer(260, 100))

    expect(surface.hitTest({ x: 225, y: 100 })).toBe(handle)
    expect(surface.hitTest({ x: 260, y: 100 })).not.toBe(handle)
  })
})
