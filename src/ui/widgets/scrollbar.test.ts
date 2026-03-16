import { describe, expect, it } from "bun:test"
import { PointerUIEvent } from "../base/ui"
import { Scrollbar } from "./scrollbar"

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

describe("scrollbar", () => {
  it("tracks live getter values without requiring update()", () => {
    let rect = { x: 0, y: 0, w: 12, h: 0 }
    let viewportSize = 0
    let contentSize = 0
    let value = 0

    const scrollbar = new Scrollbar({
      rect: () => rect,
      viewportSize: () => viewportSize,
      contentSize: () => contentSize,
      value: () => value,
      onChange: (next) => {
        value = next
      },
    })

    expect(scrollbar.bounds().h).toBe(0)

    rect = { x: 0, y: 0, w: 12, h: 100 }
    viewportSize = 100
    contentSize = 300

    expect(scrollbar.bounds().h).toBe(100)
  })

  it("jumps toward the clicked track position and keeps dragging from there", () => {
    let value = 0
    const scrollbar = new Scrollbar({
      rect: () => ({ x: 0, y: 0, w: 12, h: 100 }),
      viewportSize: () => 100,
      contentSize: () => 300,
      value: () => value,
      onChange: (next) => {
        value = next
      },
      autoHide: false,
    })

    scrollbar.emit("pointerenter")
    scrollbar.emit("pointerdown", pointer(6, 80))
    expect(value).toBeGreaterThan(100)

    scrollbar.emit("pointermove", pointer(6, 90))
    expect(value).toBeGreaterThan(150)

    const finalValue = value
    scrollbar.emit("pointerup", pointer(6, 90, 0))
    scrollbar.emit("pointermove", pointer(6, 10))
    expect(value).toBe(finalValue)
  })

  it("cancels dragging when the primary button is already released on re-entry", () => {
    let value = 0
    const scrollbar = new Scrollbar({
      rect: () => ({ x: 0, y: 0, w: 12, h: 100 }),
      viewportSize: () => 100,
      contentSize: () => 300,
      value: () => value,
      onChange: (next) => {
        value = next
      },
      autoHide: false,
    })

    scrollbar.emit("pointerenter")
    scrollbar.emit("pointerdown", pointer(6, 80))
    scrollbar.emit("pointermove", pointer(6, 90))
    const finalValue = value

    scrollbar.emit("pointerleave")
    scrollbar.emit("pointermove", pointer(6, 20, 0))
    scrollbar.emit("pointermove", pointer(6, 10, 0))

    expect(value).toBe(finalValue)
  })

  it("cancels dragging on pointer cancel", () => {
    let value = 0
    const scrollbar = new Scrollbar({
      rect: () => ({ x: 0, y: 0, w: 12, h: 100 }),
      viewportSize: () => 100,
      contentSize: () => 300,
      value: () => value,
      onChange: (next) => {
        value = next
      },
      autoHide: false,
    })

    scrollbar.emit("pointerenter")
    scrollbar.emit("pointerdown", pointer(6, 80))
    scrollbar.emit("pointermove", pointer(6, 90))
    const finalValue = value

    scrollbar.emit("pointercancel", { event: null, reason: "blur" })
    scrollbar.emit("pointermove", pointer(6, 10))

    expect(value).toBe(finalValue)
  })
})
