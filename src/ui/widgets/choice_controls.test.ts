import { describe, expect, it } from "bun:test"
import { signal } from "../../core/reactivity"
import { ControlElement } from "../builder/control"
import { PointerUIEvent } from "../base/ui"

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

describe("choice controls", () => {
  it("does not toggle checkbox when disabled", () => {
    const checked = signal(false, { debugLabel: "test.choice.checked" })
    const checkbox = new ControlElement()
    checkbox.update({
      rect: { x: 0, y: 0, w: 120, h: 24 },
      active: true,
      disabled: true,
      draw: () => {},
      onClick: () => checked.set((value) => !value),
    })

    checkbox.emit("pointerenter")
    checkbox.emit("pointerdown", pointer())
    checkbox.emit("pointerup", pointer())

    expect(checked.peek()).toBe(false)
  })

  it("does not select radio when disabled", () => {
    const selected = signal("A", { debugLabel: "test.choice.selected" })
    const radio = new ControlElement()
    radio.update({
      rect: { x: 0, y: 0, w: 120, h: 24 },
      active: true,
      disabled: true,
      draw: () => {},
      onClick: () => selected.set("B"),
    })

    radio.emit("pointerenter")
    radio.emit("pointerdown", pointer())
    radio.emit("pointerup", pointer())

    expect(selected.peek()).toBe("A")
  })
})
