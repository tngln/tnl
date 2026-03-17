import { describe, expect, it } from "bun:test"
import { Root, SurfaceWindow, WindowManager } from "@tnl/canvas-interface/ui"
import { DockingManager } from "./manager"
import { firstLeaf } from "./model"

function makeSurface(id: string) {
  return {
    id,
    render() {},
  }
}

function makeWindow(id: string) {
  return new SurfaceWindow({
    id,
    x: 32,
    y: 24,
    w: 240,
    h: 160,
    title: id,
    open: true,
    resizable: true,
    body: makeSurface(`${id}.Body`),
  })
}

describe("docking manager", () => {
  it("docks panes into a container and can float or hide them", () => {
    const root = new Root()
    const windows = new WindowManager(root)
    const docking = new DockingManager({ windows })

    docking.registerPane({ id: "Developer", surface: makeSurface("Developer.Surface"), floatingRect: { x: 100, y: 80, w: 400, h: 240 } })
    docking.registerPane({ id: "Timeline.Tool", surface: makeSurface("Timeline.Surface"), floatingRect: { x: 120, y: 120, w: 800, h: 280 } })

    const containerId = docking.createContainer()
    docking.dockPane("Developer", containerId, null, "center")
    const leafId = firstLeaf(docking.getRoot(containerId))?.id ?? null
    docking.dockPane("Timeline.Tool", containerId, leafId, "right")

    expect(docking.listPanes().find((pane) => pane.id === "Developer")?.state).toBe("docked")
    expect(docking.listPanes().find((pane) => pane.id === "Timeline.Tool")?.containerId).toBe(containerId)

    docking.floatPane("Developer", { x: 20, y: 30, w: 320, h: 220 })
    expect(docking.listPanes().find((pane) => pane.id === "Developer")?.state).toBe("floating")
    expect(windows.listWindows().some((win) => win.id === "Dock.Float.Developer")).toBe(true)

    docking.hidePane("Developer")
    expect(docking.listPanes().find((pane) => pane.id === "Developer")?.state).toBe("hidden")
    expect(windows.listWindows().some((win) => win.id === "Dock.Float.Developer")).toBe(false)

    docking.activatePane("Developer")
    expect(docking.listPanes().find((pane) => pane.id === "Developer")?.state).toBe("docked")
  })

  it("undocks into a floating window when ending a docked drag without a target", () => {
    const root = new Root()
    const windows = new WindowManager(root)
    const docking = new DockingManager({ windows })

    docking.registerPane({ id: "Developer", surface: makeSurface("Developer.Surface"), floatingRect: { x: 100, y: 80, w: 400, h: 240 } })

    const containerId = docking.createContainer()
    docking.dockPane("Developer", containerId, null, "center")
    const leafId = firstLeaf(docking.getRoot(containerId))?.id ?? null
    expect(leafId).toBeTruthy()
    docking.beginDockedPaneDrag(containerId, "Developer", { x: 200, y: 120 })
    docking.endDrag({ x: 200, y: 120 })

    expect(docking.getPreview(containerId)).toBe(null)
    expect(docking.listPanes().find((pane) => pane.id === "Developer")?.state).toBe("floating")
  })

  it("does not expose a split preview when dragging the only pane in a leaf", () => {
    const root = new Root()
    const windows = new WindowManager(root)
    const docking = new DockingManager({ windows })

    docking.registerPane({ id: "Developer", surface: makeSurface("Developer.Surface"), floatingRect: { x: 100, y: 80, w: 400, h: 240 } })

    const containerId = docking.createContainer()
    docking.dockPane("Developer", containerId, null, "center")
    const leafId = firstLeaf(docking.getRoot(containerId))?.id ?? null
    expect(leafId).toBeTruthy()

    const normalized = (docking as any).normalizeDockPreview(
      { paneId: "Developer", source: { kind: "docked", containerId, leafId } },
      {
        containerId,
        leafId,
        placement: "left",
        rect: { x: 0, y: 0, w: 100, h: 100 },
      },
    )

    expect(normalized).toBe(null)
  })

  it("cancels a floating drag that did not move and restores the previous rect", () => {
    const root = new Root()
    const windows = new WindowManager(root)
    const docking = new DockingManager({ windows })

    docking.registerPane({ id: "Developer", surface: makeSurface("Developer.Surface"), floatingRect: { x: 100, y: 80, w: 400, h: 240 } })
    docking.floatPane("Developer")

    docking.beginFloatingPaneDrag("Developer", { x: 160, y: 96 })
    docking.endDrag({ x: 160, y: 96 })

    const floating = windows.listWindows().find((win) => win.id === "Dock.Float.Developer")
    expect(floating?.rect).toEqual({ x: 100, y: 80, w: 400, h: 240 })
    expect(docking.listPanes().find((pane) => pane.id === "Developer")?.state).toBe("floating")
  })

  it("undocks immediately into a floating window when a docked tab leaves its source window", () => {
    const root = new Root()
    const windows = new WindowManager(root)
    const docking = new DockingManager({ windows })

    docking.registerPane({ id: "Developer", surface: makeSurface("Developer.Surface"), floatingRect: { x: 100, y: 80, w: 400, h: 240 } })

    const containerId = docking.createContainer()
    docking.dockPane("Developer", containerId, null, "center")
    docking.beginDockedPaneDrag(containerId, "Developer", { x: 120, y: 90 })

    docking.updateDrag({ x: -20, y: 90 })

    expect(docking.listPanes().find((pane) => pane.id === "Developer")?.state).toBe("floating")
    let floating = windows.listWindows().find((win) => win.id === "Dock.Float.Developer")
    expect(floating).toBeTruthy()
    expect(floating?.rect.x).toBeLessThan(40)

    docking.updateDrag({ x: 260, y: 180 })

    floating = windows.listWindows().find((win) => win.id === "Dock.Float.Developer")
    expect(floating?.rect.x).toBeGreaterThan(150)
    expect(floating?.rect.y).toBeGreaterThan(120)
  })

  it("cancels drag when focus switches to another window", () => {
    const root = new Root()
    const windows = new WindowManager(root)
    const docking = new DockingManager({ windows })
    const other = makeWindow("Other")

    windows.register(other)
    docking.registerPane({ id: "Developer", surface: makeSurface("Developer.Surface"), floatingRect: { x: 100, y: 80, w: 400, h: 240 } })
    docking.floatPane("Developer")

    const floatingId = "Dock.Float.Developer"
    windows.focus(floatingId)
    docking.beginFloatingPaneDrag("Developer", { x: 160, y: 96 })
    expect((docking as any).drag.getActive()).toBeTruthy()

    windows.focus("Other")

    expect((docking as any).drag.getActive()).toBe(null)
    const floating = windows.listWindows().find((win) => win.id === floatingId)
    expect(floating?.rect).toEqual({ x: 100, y: 80, w: 400, h: 240 })
  })

  it("cancels drag when the source window is unregistered", () => {
    const root = new Root()
    const windows = new WindowManager(root)
    const docking = new DockingManager({ windows })

    docking.registerPane({ id: "Developer", surface: makeSurface("Developer.Surface"), floatingRect: { x: 100, y: 80, w: 400, h: 240 } })
    docking.floatPane("Developer")
    docking.beginFloatingPaneDrag("Developer", { x: 160, y: 96 })
    expect((docking as any).drag.getActive()).toBeTruthy()

    windows.unregister("Dock.Float.Developer")

    expect((docking as any).drag.getActive()).toBe(null)
  })
})
