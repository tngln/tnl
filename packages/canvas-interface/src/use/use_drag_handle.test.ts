import { describe, expect, it } from "bun:test"
import type { Vec2 } from "../draw"
import { PointerUIEvent, UIElement } from "../ui/ui_base"
import { useDragHandle } from "./use_drag_handle"

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

class TestDragHandle extends UIElement {
  readonly drag

  constructor(
    opts: Parameters<typeof useDragHandle>[1],
  ) {
    super()
    this.drag = useDragHandle(this, opts)
  }

  bounds() {
    return { x: 0, y: 0, w: 100, h: 100 }
  }

  protected containsPoint(_p: Vec2) {
    return true
  }
}

describe("useDragHandle", () => {
  it("treats a press-and-release under threshold as a click-style release", () => {
    const releases: Vec2[] = []
    const handle = new TestDragHandle({
      thresholdSq: 16,
      onPressRelease: ({ current }) => {
        releases.push(current)
      },
    })

    handle.emit("pointerdown", pointer(12, 16))
    expect(handle.drag.pressed()).toBe(true)

    handle.emit("pointermove", pointer(14, 18))
    handle.emit("pointerup", pointer(14, 18, 0))

    expect(releases).toEqual([{ x: 14, y: 18 }])
    expect(handle.drag.state()).toBe("idle")
  })

  it("tracks drag start, move, and end after crossing the threshold", () => {
    const events: string[] = []
    const handle = new TestDragHandle({
      thresholdSq: 16,
      onDragStart: ({ current }) => events.push(`start:${current.x},${current.y}`),
      onDragMove: ({ current }) => events.push(`move:${current.x},${current.y}`),
      onDragEnd: ({ current }) => events.push(`end:${current.x},${current.y}`),
    })

    handle.emit("pointerdown", pointer(10, 10))
    handle.emit("pointermove", pointer(12, 12))
    expect(events).toEqual([])
    expect(handle.drag.pressed()).toBe(true)

    handle.emit("pointermove", pointer(20, 10))
    expect(handle.drag.dragging()).toBe(true)

    handle.emit("pointermove", pointer(28, 10))
    handle.emit("pointerup", pointer(28, 10, 0))

    expect(events).toEqual([
      "start:20,10",
      "move:20,10",
      "move:28,10",
      "end:28,10",
    ])
    expect(handle.drag.state()).toBe("idle")
  })

  it("can cancel a pressed handle on pointer leave", () => {
    const reasons: string[] = []
    const handle = new TestDragHandle({
      cancelOnLeave: true,
      onCancel: (reason) => reasons.push(reason),
    })

    handle.emit("pointerdown", pointer(18, 18))
    expect(handle.drag.pressed()).toBe(true)

    handle.emit("pointerleave")

    expect(reasons).toEqual(["leave"])
    expect(handle.drag.state()).toBe("idle")
  })
})
