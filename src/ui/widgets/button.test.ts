import { describe, expect, it } from "bun:test"
import { PointerUIEvent } from "../base/ui"
import { Button } from "./button"

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
    const button = new Button({
      rect: () => ({ x: 0, y: 0, w: 80, h: 24 }),
      text: "Disabled",
      disabled: () => true,
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
    const button = new Button({
      rect: () => ({ x: 0, y: 0, w: 80, h: 24 }),
      text: "Enabled",
      onClick: () => {
        clicks += 1
      },
    })

    button.emit("pointerenter")
    button.emit("pointerdown", pointer())
    button.emit("pointerup", pointer())

    expect(clicks).toBe(1)
  })
})
