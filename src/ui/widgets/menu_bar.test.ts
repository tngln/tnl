import { describe, expect, it } from "bun:test"
import { TopLayerController } from "../base/top_layer"
import { PointerUIEvent } from "../base/ui"
import { MenuBar, type MenuBarMenu } from "./menu_bar"

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

describe("menu bar", () => {
  it("opens a menu and closes after selecting an item", () => {
    const logs: string[] = []
    const menus: MenuBarMenu[] = [
      {
        key: "file",
        label: "File",
        items: [
          { key: "file.open", text: "Open", onSelect: () => logs.push("open") },
          { key: "file.close", text: "Close", onSelect: () => logs.push("close") },
        ],
      },
      { key: "help", label: "Help", items: [{ key: "help.about", text: "About", onSelect: () => logs.push("about") }] },
    ]
    const topLayer = new TopLayerController({ rect: () => ({ x: -1e9, y: -1e9, w: 2e9, h: 2e9 }), invalidate: () => {}, z: 0 })
    const bar = new MenuBar({
      id: "test",
      rect: () => ({ x: 0, y: 0, w: 400, h: 28 }),
      menus,
      topLayer,
    })

    bar.emit("pointerenter")
    bar.emit("pointerdown", pointer(10, 10))
    bar.emit("pointerup", pointer(10, 10, 0))
    expect(topLayer.hasAny()).toBe(true)

    const menuHit = topLayer.host.hitTest({ x: 10, y: 28 + 2 + 10 }) as any
    expect(menuHit).toBeTruthy()
    menuHit.emit("pointerenter")
    menuHit.emit("pointermove", pointer(10, 28 + 2 + 10, 0))
    menuHit.emit("pointerdown", pointer(10, 28 + 2 + 10))
    menuHit.emit("pointerup", pointer(10, 28 + 2 + 10, 0))

    expect(logs).toEqual(["open"])
    expect(topLayer.hasAny()).toBe(false)
  })

  it("supports a submenu item", () => {
    const logs: string[] = []
    const menus: MenuBarMenu[] = [
      {
        key: "file",
        label: "File",
        items: [
          {
            key: "file.import",
            text: "Import",
            submenu: [
              { key: "file.import.media", text: "Media File", onSelect: () => logs.push("media") },
              { key: "file.import.online", text: "Online Video Services", onSelect: () => logs.push("online") },
            ],
          },
        ],
      },
    ]
    const topLayer = new TopLayerController({ rect: () => ({ x: -1e9, y: -1e9, w: 2e9, h: 2e9 }), invalidate: () => {}, z: 0 })
    const bar = new MenuBar({
      id: "test",
      rect: () => ({ x: 0, y: 0, w: 500, h: 28 }),
      menus,
      topLayer,
    })

    bar.emit("pointerenter")
    bar.emit("pointerdown", pointer(10, 10))
    bar.emit("pointerup", pointer(10, 10, 0))
    expect(topLayer.hasAny()).toBe(true)

    const rootMenuHit = topLayer.host.hitTest({ x: 10, y: 28 + 2 + 10 }) as any
    expect(rootMenuHit).toBeTruthy()
    rootMenuHit.emit("pointerenter")
    rootMenuHit.emit("pointermove", pointer(10, 28 + 2 + 10, 0))
    rootMenuHit.emit("pointerleave")

    const subMenuHit = topLayer.host.hitTest({ x: 230, y: 28 + 2 + 10 }) as any
    expect(subMenuHit).toBeTruthy()
    subMenuHit.emit("pointerenter")
    subMenuHit.emit("pointermove", pointer(230, 28 + 2 + 10, 0))
    subMenuHit.emit("pointerdown", pointer(230, 28 + 2 + 10))
    subMenuHit.emit("pointerup", pointer(230, 28 + 2 + 10, 0))

    expect(logs).toEqual(["media"])
    expect(topLayer.hasAny()).toBe(false)
  })
})
