import { describe, expect, it } from "bun:test"
import { theme } from "../../config/theme"
import { PointerUIEvent } from "../base/ui"
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

function maximizeButtonPoint(win: SurfaceWindow) {
  const pad = theme.ui.closeButtonPad
  const size = win.titleBarHeight - pad * 2
  return {
    x: win.x.peek() + win.w.peek() - pad - size - (size + 2) + size / 2,
    y: win.y.peek() + pad + size / 2,
  }
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

  it("maximizes windows to the current canvas and restores their previous rect", () => {
    const root = new Root()
    const coordinator = new WindowManager(root)
    const a = makeWindow("A")

    coordinator.register(a)
    coordinator.setCanvasSize({ x: 800, y: 600 })
    coordinator.maximize("A")

    let snap = coordinator.listWindows().find((entry) => entry.id === "A")
    expect(snap?.maximized).toBe(true)
    expect(snap?.rect).toEqual({ x: 0, y: 0, w: 800, h: 600 })

    coordinator.setCanvasSize({ x: 1024, y: 720 })
    snap = coordinator.listWindows().find((entry) => entry.id === "A")
    expect(snap?.rect).toEqual({ x: 0, y: 0, w: 1024, h: 720 })

    coordinator.toggleMaximize("A")
    snap = coordinator.listWindows().find((entry) => entry.id === "A")
    expect(snap?.maximized).toBe(false)
    expect(snap?.rect).toEqual({ x: 10, y: 20, w: 200, h: 120 })
  })

  it("toggles maximize on title-bar double click", () => {
    const root = new Root()
    const coordinator = new WindowManager(root)
    const a = makeWindow("A")

    coordinator.register(a)
    coordinator.setCanvasSize({ x: 640, y: 480 })

    const originalNow = Date.now
    let now = 1_000
    Date.now = () => now
    try {
      const down = () =>
        a.onPointerDown(
          new PointerUIEvent({
            pointerId: 1,
            x: 40,
            y: 24,
            button: 0,
            buttons: 1,
            altKey: false,
            ctrlKey: false,
            shiftKey: false,
            metaKey: false,
          }),
        )
      const up = () =>
        a.onPointerUp(
          new PointerUIEvent({
            pointerId: 1,
            x: 40,
            y: 24,
            button: 0,
            buttons: 0,
            altKey: false,
            ctrlKey: false,
            shiftKey: false,
            metaKey: false,
          }),
        )

      down()
      up()
      now += 100
      down()
      up()
      expect(a.maximized.peek()).toBe(true)
      expect(a.bounds()).toEqual({ x: 0, y: 0, w: 640, h: 480 })

      now += 100
      down()
      up()
      now += 100
      down()
      up()
      expect(a.maximized.peek()).toBe(false)
      expect(a.bounds()).toEqual({ x: 10, y: 20, w: 200, h: 120 })
    } finally {
      Date.now = originalNow
    }
  })

  it("toggles maximize from the title-bar button", () => {
    const root = new Root()
    const coordinator = new WindowManager(root)
    const a = makeWindow("A")

    coordinator.register(a)
    coordinator.setCanvasSize({ x: 900, y: 600 })

    const point = maximizeButtonPoint(a)

    const target = root.hitTest(point)
    expect(target).toBeTruthy()

    target?.onPointerEnter()
    target?.onPointerDown(
      new PointerUIEvent({
        pointerId: 1,
        x: point.x,
        y: point.y,
        button: 0,
        buttons: 1,
        altKey: false,
        ctrlKey: false,
        shiftKey: false,
        metaKey: false,
      }),
    )
    target?.onPointerUp(
      new PointerUIEvent({
        pointerId: 1,
        x: point.x,
        y: point.y,
        button: 0,
        buttons: 0,
        altKey: false,
        ctrlKey: false,
        shiftKey: false,
        metaKey: false,
      }),
    )
    expect(a.maximized.peek()).toBe(true)
    expect(a.bounds()).toEqual({ x: 0, y: 0, w: 900, h: 600 })

    const restorePoint = maximizeButtonPoint(a)
    const restoreTarget = root.hitTest(restorePoint)
    expect(restoreTarget).toBeTruthy()
    restoreTarget?.onPointerEnter()
    restoreTarget?.onPointerDown(
      new PointerUIEvent({
        pointerId: 1,
        x: restorePoint.x,
        y: restorePoint.y,
        button: 0,
        buttons: 1,
        altKey: false,
        ctrlKey: false,
        shiftKey: false,
        metaKey: false,
      }),
    )
    restoreTarget?.onPointerUp(
      new PointerUIEvent({
        pointerId: 1,
        x: restorePoint.x,
        y: restorePoint.y,
        button: 0,
        buttons: 0,
        altKey: false,
        ctrlKey: false,
        shiftKey: false,
        metaKey: false,
      }),
    )
    expect(a.maximized.peek()).toBe(false)
    expect(a.bounds()).toEqual({ x: 10, y: 20, w: 200, h: 120 })
  })

  it("restores and moves when dragging the title bar from a maximized state", () => {
    const root = new Root()
    const coordinator = new WindowManager(root)
    const a = makeWindow("A")

    coordinator.register(a)
    coordinator.setCanvasSize({ x: 900, y: 600 })
    coordinator.maximize("A")

    a.onPointerDown(
      new PointerUIEvent({
        pointerId: 1,
        x: 360,
        y: 16,
        button: 0,
        buttons: 1,
        altKey: false,
        ctrlKey: false,
        shiftKey: false,
        metaKey: false,
      }),
    )
    a.onPointerMove(
      new PointerUIEvent({
        pointerId: 1,
        x: 420,
        y: 48,
        button: 0,
        buttons: 1,
        altKey: false,
        ctrlKey: false,
        shiftKey: false,
        metaKey: false,
      }),
    )
    a.onPointerMove(
      new PointerUIEvent({
        pointerId: 1,
        x: 460,
        y: 64,
        button: 0,
        buttons: 1,
        altKey: false,
        ctrlKey: false,
        shiftKey: false,
        metaKey: false,
      }),
    )
    a.onPointerUp(
      new PointerUIEvent({
        pointerId: 1,
        x: 460,
        y: 64,
        button: 0,
        buttons: 0,
        altKey: false,
        ctrlKey: false,
        shiftKey: false,
        metaKey: false,
      }),
    )

    expect(a.maximized.peek()).toBe(false)
    expect(a.bounds().w).toBe(200)
    expect(a.bounds().h).toBe(120)
    expect(a.bounds().x).toBeGreaterThan(0)
    expect(a.bounds().x).toBeLessThan(460)
    expect(a.bounds().y).toBeGreaterThan(0)
    expect(a.bounds().y).toBeLessThan(64)
  })

  it("cancels title-bar dragging when pointer interaction is interrupted", () => {
    const root = new Root()
    const coordinator = new WindowManager(root)
    const a = makeWindow("A")

    coordinator.register(a)

    a.onPointerDown(
      new PointerUIEvent({
        pointerId: 1,
        x: 40,
        y: 24,
        button: 0,
        buttons: 1,
        altKey: false,
        ctrlKey: false,
        shiftKey: false,
        metaKey: false,
      }),
    )
    a.onPointerMove(
      new PointerUIEvent({
        pointerId: 1,
        x: 90,
        y: 54,
        button: 0,
        buttons: 1,
        altKey: false,
        ctrlKey: false,
        shiftKey: false,
        metaKey: false,
      }),
    )
    const moved = a.bounds()

    a.onPointerCancel(null, "blur")
    a.onPointerMove(
      new PointerUIEvent({
        pointerId: 1,
        x: 140,
        y: 90,
        button: 0,
        buttons: 1,
        altKey: false,
        ctrlKey: false,
        shiftKey: false,
        metaKey: false,
      }),
    )

    expect(a.bounds()).toEqual(moved)
  })

  it("snaps to the left half when released near the left screen edge", () => {
    const root = new Root()
    const coordinator = new WindowManager(root)
    const a = makeWindow("A")

    coordinator.register(a)
    coordinator.setCanvasSize({ x: 1000, y: 700 })

    a.onPointerDown(
      new PointerUIEvent({
        pointerId: 1,
        x: 40,
        y: 24,
        button: 0,
        buttons: 1,
        altKey: false,
        ctrlKey: false,
        shiftKey: false,
        metaKey: false,
      }),
    )
    a.onPointerMove(
      new PointerUIEvent({
        pointerId: 1,
        x: 8,
        y: 120,
        button: 0,
        buttons: 1,
        altKey: false,
        ctrlKey: false,
        shiftKey: false,
        metaKey: false,
      }),
    )
    a.onPointerUp(
      new PointerUIEvent({
        pointerId: 1,
        x: 8,
        y: 120,
        button: 0,
        buttons: 0,
        altKey: false,
        ctrlKey: false,
        shiftKey: false,
        metaKey: false,
      }),
    )

    expect(a.maximized.peek()).toBe(false)
    expect(a.screenUsage.peek()).toBe("left-half")
    expect(a.bounds()).toEqual({ x: 0, y: 0, w: 500, h: 700 })
  })

  it("snaps to the right half when released near the right screen edge", () => {
    const root = new Root()
    const coordinator = new WindowManager(root)
    const a = makeWindow("A")

    coordinator.register(a)
    coordinator.setCanvasSize({ x: 1001, y: 700 })

    a.onPointerDown(
      new PointerUIEvent({
        pointerId: 1,
        x: 40,
        y: 24,
        button: 0,
        buttons: 1,
        altKey: false,
        ctrlKey: false,
        shiftKey: false,
        metaKey: false,
      }),
    )
    a.onPointerMove(
      new PointerUIEvent({
        pointerId: 1,
        x: 996,
        y: 120,
        button: 0,
        buttons: 1,
        altKey: false,
        ctrlKey: false,
        shiftKey: false,
        metaKey: false,
      }),
    )
    a.onPointerUp(
      new PointerUIEvent({
        pointerId: 1,
        x: 996,
        y: 120,
        button: 0,
        buttons: 0,
        altKey: false,
        ctrlKey: false,
        shiftKey: false,
        metaKey: false,
      }),
    )

    expect(a.maximized.peek()).toBe(false)
    expect(a.screenUsage.peek()).toBe("right-half")
    expect(a.bounds()).toEqual({ x: 500, y: 0, w: 501, h: 700 })
  })

  it("maximizes when released near the top edge", () => {
    const root = new Root()
    const coordinator = new WindowManager(root)
    const a = makeWindow("A")

    coordinator.register(a)
    coordinator.setCanvasSize({ x: 960, y: 640 })

    a.onPointerDown(
      new PointerUIEvent({
        pointerId: 1,
        x: 40,
        y: 24,
        button: 0,
        buttons: 1,
        altKey: false,
        ctrlKey: false,
        shiftKey: false,
        metaKey: false,
      }),
    )
    a.onPointerMove(
      new PointerUIEvent({
        pointerId: 1,
        x: 320,
        y: 8,
        button: 0,
        buttons: 1,
        altKey: false,
        ctrlKey: false,
        shiftKey: false,
        metaKey: false,
      }),
    )
    a.onPointerUp(
      new PointerUIEvent({
        pointerId: 1,
        x: 320,
        y: 8,
        button: 0,
        buttons: 0,
        altKey: false,
        ctrlKey: false,
        shiftKey: false,
        metaKey: false,
      }),
    )

    expect(a.maximized.peek()).toBe(true)
    expect(a.screenUsage.peek()).toBe("none")
    expect(a.bounds()).toEqual({ x: 0, y: 0, w: 960, h: 640 })
  })

  it("shows a snap preview while dragging toward an edge", () => {
    const root = new Root()
    const coordinator = new WindowManager(root)
    const a = makeWindow("A")

    coordinator.register(a)
    coordinator.setCanvasSize({ x: 1000, y: 700 })

    a.onPointerDown(
      new PointerUIEvent({
        pointerId: 1,
        x: 40,
        y: 24,
        button: 0,
        buttons: 1,
        altKey: false,
        ctrlKey: false,
        shiftKey: false,
        metaKey: false,
      }),
    )
    a.onPointerMove(
      new PointerUIEvent({
        pointerId: 1,
        x: 8,
        y: 120,
        button: 0,
        buttons: 1,
        altKey: false,
        ctrlKey: false,
        shiftKey: false,
        metaKey: false,
      }),
    )

    expect(coordinator.getSnapPreviewRect()).toEqual({ x: 0, y: 0, w: 500, h: 700 })

    a.onPointerUp(
      new PointerUIEvent({
        pointerId: 1,
        x: 8,
        y: 120,
        button: 0,
        buttons: 0,
        altKey: false,
        ctrlKey: false,
        shiftKey: false,
        metaKey: false,
      }),
    )

    expect(coordinator.getSnapPreviewRect()).toBe(null)
  })

  it("restores the previous rect when leaving half-screen usage", () => {
    const root = new Root()
    const coordinator = new WindowManager(root)
    const a = makeWindow("A")

    coordinator.register(a)
    coordinator.setCanvasSize({ x: 1000, y: 700 })
    a.useLeftHalfScreen({ x: 0, y: 0, w: 500, h: 700 })

    expect(a.screenUsage.peek()).toBe("left-half")
    expect(a.bounds()).toEqual({ x: 0, y: 0, w: 500, h: 700 })

    a.restoreScreenUsage()

    expect(a.screenUsage.peek()).toBe("none")
    expect(a.maximized.peek()).toBe(false)
    expect(a.bounds()).toEqual({ x: 10, y: 20, w: 200, h: 120 })
  })

  it("resizes through the bottom-right resize handle", () => {
    const root = new Root()
    const coordinator = new WindowManager(root)
    const a = makeWindow("A")

    coordinator.register(a)

    const start = { x: a.x.peek() + a.w.peek() - 8, y: a.y.peek() + a.h.peek() - 8 }
    const handle = root.hitTest(start)
    expect(handle).toBeTruthy()

    handle?.onPointerDown(
      new PointerUIEvent({
        pointerId: 1,
        x: start.x,
        y: start.y,
        button: 0,
        buttons: 1,
        altKey: false,
        ctrlKey: false,
        shiftKey: false,
        metaKey: false,
      }),
    )
    handle?.onPointerMove(
      new PointerUIEvent({
        pointerId: 1,
        x: start.x + 40,
        y: start.y + 30,
        button: 0,
        buttons: 1,
        altKey: false,
        ctrlKey: false,
        shiftKey: false,
        metaKey: false,
      }),
    )
    handle?.onPointerUp(
      new PointerUIEvent({
        pointerId: 1,
        x: start.x + 40,
        y: start.y + 30,
        button: 0,
        buttons: 0,
        altKey: false,
        ctrlKey: false,
        shiftKey: false,
        metaKey: false,
      }),
    )

    expect(a.w.peek()).toBe(240)
    expect(a.h.peek()).toBe(150)
  })
})
