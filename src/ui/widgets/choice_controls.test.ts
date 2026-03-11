import { describe, expect, it } from "bun:test"
import { signal } from "../../core/reactivity"
import { PointerUIEvent } from "../base/ui"
import { Checkbox } from "./checkbox"
import { Radio } from "./radio"

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
    const checkbox = new Checkbox({
      rect: () => ({ x: 0, y: 0, w: 120, h: 24 }),
      label: "Disabled",
      checked,
      disabled: () => true,
    })

    checkbox.onPointerEnter()
    checkbox.onPointerDown(pointer())
    checkbox.onPointerUp(pointer())

    expect(checked.peek()).toBe(false)
  })

  it("does not select radio when disabled", () => {
    const selected = signal("A", { debugLabel: "test.choice.selected" })
    const radio = new Radio({
      rect: () => ({ x: 0, y: 0, w: 120, h: 24 }),
      label: "Disabled",
      value: "B",
      selected,
      disabled: () => true,
    })

    radio.onPointerEnter()
    radio.onPointerDown(pointer())
    radio.onPointerUp(pointer())

    expect(selected.peek()).toBe("A")
  })
})
