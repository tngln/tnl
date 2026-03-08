import { describe, expect, it } from "bun:test"
import { Root, SurfaceWindow } from "./window"
import { WindowManager } from "./window_manager"

function makeWindow(id: string, title = id) {
  return new SurfaceWindow({
    id,
    x: 10,
    y: 20,
    w: 200,
    h: 120,
    title,
    open: true,
    resizable: true,
    body: {
      id: `${id}.Body`,
      render() {},
    },
  })
}

describe("window manager", () => {
  it("lists stable snapshots and focuses windows", () => {
    const root = new Root()
    const coordinator = new WindowManager(root)
    const a = makeWindow("A")
    const b = makeWindow("B")

    coordinator.register(a)
    coordinator.register(b)
    coordinator.focus("A")

    const list = coordinator.listWindows()
    expect(list.map((entry) => entry.id)).toEqual(["B", "A"])
    expect(list.find((entry) => entry.id === "A")?.focused).toBe(true)
    expect(list.find((entry) => entry.id === "A")?.zOrder).toBeGreaterThan(list.find((entry) => entry.id === "B")?.zOrder ?? 0)
  })

  it("toggles and restores window open state through coordinator api", () => {
    const root = new Root()
    const coordinator = new WindowManager(root)
    const a = makeWindow("A")

    coordinator.register(a)
    coordinator.close("A")
    expect(coordinator.listWindows()[0].open).toBe(false)

    coordinator.open("A")
    expect(coordinator.listWindows()[0].open).toBe(true)

    coordinator.toggle("A")
    expect(coordinator.listWindows()[0].open).toBe(false)
  })

  it("lays out minimized tiles from coordinator instead of root", () => {
    const root = new Root()
    const coordinator = new WindowManager(root)
    const a = makeWindow("A")
    const b = makeWindow("B")

    coordinator.register(a)
    coordinator.register(b)
    coordinator.setCanvasSize({ x: 500, y: 300 })
    coordinator.minimize("A")
    coordinator.minimize("B")

    const snaps = coordinator.listWindows()
    const aRect = snaps.find((entry) => entry.id === "A")?.rect
    const bRect = snaps.find((entry) => entry.id === "B")?.rect
    expect(aRect).toBeTruthy()
    expect(bRect).toBeTruthy()
    expect(aRect?.y).toBe(264)
    expect(bRect?.y).toBe(264)
    expect(bRect?.x).toBeGreaterThan(aRect?.x ?? 0)
  })

  it("tracks state changes coming from window methods", () => {
    const root = new Root()
    const coordinator = new WindowManager(root)
    const a = makeWindow("A")
    const b = makeWindow("B")

    coordinator.register(a)
    coordinator.register(b)
    coordinator.focus("B")
    b.minimize()

    const list = coordinator.listWindows()
    expect(list.find((entry) => entry.id === "B")?.minimized).toBe(true)
    expect(list.find((entry) => entry.id === "A")?.focused).toBe(true)
  })
})
