import { describe, expect, it } from "bun:test"
import { TopLayerController, useClickOutsideHandler } from "../base/top_layer"
import { PointerUIEvent } from "../base/ui"
import { Menu, MENU_ROW_HEIGHT, MENU_SEPARATOR_HEIGHT, type MenuItem } from "./menu"

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

describe("menu", () => {
  it("selects enabled items and ignores disabled and separators", () => {
    const events: string[] = []
    const items: MenuItem[] = [
      { key: "a", text: "A", onSelect: () => events.push("a") },
      { kind: "separator", key: "sep" },
      { key: "b", text: "B", disabled: true, onSelect: () => events.push("b") },
      { key: "c", text: "C", onSelect: () => events.push("c") },
    ]
    const menu = new Menu({
      rect: () => ({ x: 0, y: 0, w: 200, h: MENU_ROW_HEIGHT + MENU_SEPARATOR_HEIGHT + MENU_ROW_HEIGHT + MENU_ROW_HEIGHT }),
      items,
      onSelect: (key) => events.push(`select:${key}`),
      onDismiss: () => events.push("dismiss"),
    })

    menu.onPointerEnter()
    menu.onPointerMove(pointer(10, 10, 0))
    menu.onPointerDown(pointer(10, 10))
    menu.onPointerUp(pointer(10, 10))
    expect(events).toEqual(["a", "select:a"])

    events.length = 0
    const sepY = MENU_ROW_HEIGHT + Math.floor(MENU_SEPARATOR_HEIGHT / 2)
    menu.onPointerMove(pointer(10, sepY, 0))
    menu.onPointerDown(pointer(10, sepY))
    menu.onPointerUp(pointer(10, sepY))
    expect(events).toEqual(["dismiss"])

    events.length = 0
    const disabledY = MENU_ROW_HEIGHT + MENU_SEPARATOR_HEIGHT + Math.floor(MENU_ROW_HEIGHT / 2)
    menu.onPointerMove(pointer(10, disabledY, 0))
    menu.onPointerDown(pointer(10, disabledY))
    menu.onPointerUp(pointer(10, disabledY))
    expect(events).toEqual(["dismiss"])

    events.length = 0
    const cY = MENU_ROW_HEIGHT + MENU_SEPARATOR_HEIGHT + MENU_ROW_HEIGHT + Math.floor(MENU_ROW_HEIGHT / 2)
    menu.onPointerMove(pointer(10, cY, 0))
    menu.onPointerDown(pointer(10, cY))
    menu.onPointerUp(pointer(10, cY))
    expect(events).toEqual(["c", "select:c"])
  })

  it("supports top layer light dismiss", () => {
    const topLayer = new TopLayerController({ rect: () => ({ x: -1e9, y: -1e9, w: 2e9, h: 2e9 }), invalidate: () => {}, z: 0 })
    const menu = new Menu({
      rect: () => ({ x: 0, y: 0, w: 200, h: 44 }),
      items: [{ key: "a", text: "A" }],
    })
    topLayer.open("menu:test", menu)
    expect(topLayer.hasAny()).toBe(true)

    topLayer.lightDismiss({ x: 500, y: 500 })
    expect(topLayer.hasAny()).toBe(false)
  })

  it("useClickOutsideHandler calls onDismiss instead of closeAll", () => {
    const topLayer = new TopLayerController({ rect: () => ({ x: -1e9, y: -1e9, w: 2e9, h: 2e9 }), invalidate: () => {}, z: 0 })
    const events: string[] = []
    const menu = new Menu({
      rect: () => ({ x: 0, y: 0, w: 200, h: 44 }),
      items: [{ key: "a", text: "A" }],
    })
    const cleanup = useClickOutsideHandler({
      id: "dropdown:test",
      element: menu,
      topLayer,
      onDismiss: () => {
        events.push("dismissed")
        cleanup()
      },
    })
    expect(topLayer.hasAny()).toBe(true)

    // Click inside → no dismiss
    topLayer.lightDismiss({ x: 100, y: 22 })
    expect(events).toEqual([])
    expect(topLayer.hasAny()).toBe(true)

    // Click outside → onDismiss called, overlay removed by cleanup
    topLayer.lightDismiss({ x: 500, y: 500 })
    expect(events).toEqual(["dismissed"])
    expect(topLayer.hasAny()).toBe(false)
  })

  it("useClickOutsideHandler cleanup removes overlay", () => {
    const topLayer = new TopLayerController({ rect: () => ({ x: -1e9, y: -1e9, w: 2e9, h: 2e9 }), invalidate: () => {}, z: 0 })
    const menu = new Menu({
      rect: () => ({ x: 0, y: 0, w: 200, h: 44 }),
      items: [{ key: "a", text: "A" }],
    })
    const cleanup = useClickOutsideHandler({
      id: "test:cleanup",
      element: menu,
      topLayer,
      onDismiss: () => {},
    })
    expect(topLayer.hasAny()).toBe(true)
    cleanup()
    expect(topLayer.hasAny()).toBe(false)
  })
})
