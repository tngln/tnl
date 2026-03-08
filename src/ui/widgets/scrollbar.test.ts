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

    scrollbar.onPointerEnter()
    scrollbar.onPointerDown(pointer(6, 80))
    expect(value).toBeGreaterThan(100)

    scrollbar.onPointerMove(pointer(6, 90))
    expect(value).toBeGreaterThan(150)

    const finalValue = value
    scrollbar.onPointerUp(pointer(6, 90, 0))
    scrollbar.onPointerMove(pointer(6, 10))
    expect(value).toBe(finalValue)
  })
})
