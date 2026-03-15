import { describe, expect, it } from "bun:test"
import { PointerUIEvent } from "../base/ui"
import { Slider } from "./slider"

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

describe("slider", () => {
  it("updates the value from horizontal pointer position", () => {
    let value = 0
    const slider = new Slider({
      rect: () => ({ x: 0, y: 0, w: 100, h: 20 }),
      min: 0,
      max: 10,
      value: () => value,
      onChange: (next) => {
        value = next
      },
    })

    slider.emit("pointerenter")
    slider.emit("pointerdown", pointer(75, 10))

    expect(value).toBeGreaterThan(6)
    expect(value).toBeLessThan(9)
  })

  it("does not change when disabled", () => {
    let value = 3
    const slider = new Slider({
      rect: () => ({ x: 0, y: 0, w: 100, h: 20 }),
      min: 0,
      max: 10,
      value: () => value,
      disabled: () => true,
      onChange: (next) => {
        value = next
      },
    })

    slider.emit("pointerenter")
    slider.emit("pointerdown", pointer(90, 10))

    expect(value).toBe(3)
  })
})