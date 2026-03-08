import type { Surface } from "../base/viewport"
import { pointInRect, type Rect, type Vec2 } from "../base/ui"
import { SurfaceWindow } from "../window/window"
import { type WindowManager } from "../window/window_manager"
import { clampRatio, findLeaf, findLeafByPane, firstLeaf, insertPane, removePane, type DockDropPlacement, type DockNode } from "./model"
import { DockWorkspaceSurface, type DockDropPreview, type DockWorkspaceDriver } from "./workspace_surface"

export type DockingPaneSnapshot = {
  id: string
  title: string
  state: "docked" | "floating" | "hidden"
  containerId: string | null
}

export type DockingContainerSnapshot = {
  id: string
  title: string
}

export type DockingControlApi = {
  listPanes(): DockingPaneSnapshot[]
  listContainers(): DockingContainerSnapshot[]
  activatePane(id: string): void
  hidePane(id: string): void
  floatPane(id: string, rect?: Rect): void
  createContainer(): string
}

type DockablePaneState = {
  id: string
  surface: Surface
  title: string
  floatingRect: Rect
  state: "docked" | "floating" | "hidden"
  hostContainerId: string | null
  leafId: string | null
  lastDockContainerId: string | null
  lastDockLeafId: string | null
  floatingWindowId: string | null
}

type DockContainerRecord = {
  id: string
  title: string
  root: DockNode | null
  surface: DockWorkspaceSurface
  window: DockingContainerWindow
}

type DragSession =
  | {
      paneId: string
      source: { kind: "docked"; containerId: string; leafId: string }
      preview: DockDropPreview | null
    }
  | {
      paneId: string
      source: { kind: "floating"; originRect: Rect; followPointer: boolean }
      preview: DockDropPreview | null
    }

type DockingManagerOptions = {
  windows: WindowManager
}

export type DockablePaneInit = {
  id: string
  surface: Surface
  floatingRect: Rect
}

class DockingContainerWindow extends SurfaceWindow {
  readonly containerId: string

  constructor(opts: { id: string; title: string; x: number; y: number; w: number; h: number; body: Surface }) {
    super({
      id: opts.id,
      x: opts.x,
      y: opts.y,
      w: opts.w,
      h: opts.h,
      title: opts.title,
      open: true,
      resizable: true,
      minW: 420,
      minH: 260,
      chrome: "default",
      body: opts.body,
    })
    this.containerId = opts.id
  }
}

class FloatingPaneWindow extends SurfaceWindow {
  readonly paneId: string
  private readonly onHidePane: () => void

  constructor(opts: { paneId: string; title: string; rect: Rect; body: Surface; onHidePane: () => void }) {
    super({
      id: `Dock.Float.${opts.paneId}`,
      x: opts.rect.x,
      y: opts.rect.y,
      w: opts.rect.w,
      h: opts.rect.h,
      title: opts.title,
      open: true,
      resizable: true,
      minW: 220,
      minH: 140,
      chrome: "tool",
      minimizable: false,
      body: opts.body,
    })
    this.paneId = opts.paneId
    this.onHidePane = opts.onHidePane
  }

  closeWindow() {
    this.onHidePane()
  }
}

function inferPaneTitle(id: string) {
  const head = id.split(".")[0] ?? id
  return head.replace(/[_-]+/g, " ").trim() || id
}

export class DockingManager implements DockingControlApi, DockWorkspaceDriver {
  private readonly windows: WindowManager
  private readonly panes = new Map<string, DockablePaneState>()
  private readonly containers = new Map<string, DockContainerRecord>()
  private invalidate: (() => void) | null = null
  private nextContainerId = 1
  private nextNodeId = 1
  private mainContainerId: string | null = null
  private dragSession: DragSession | null = null
  private readonly windowListener = {
    onBeforeFocus: (nextId: string) => this.cancelDragForFocusChange(nextId),
    onBeforeClose: (id: string) => this.cancelDragForWindowInterruption(id),
    onBeforeMinimize: (id: string) => this.cancelDragForWindowInterruption(id),
    onBeforeUnregister: (id: string) => this.cancelDragForWindowInterruption(id),
  }

  constructor(opts: DockingManagerOptions) {
    this.windows = opts.windows
    this.windows.addListener(this.windowListener)
  }

  setInvalidate(fn: (() => void) | null) {
    this.invalidate = fn
  }

  registerPane(init: DockablePaneInit) {
    if (this.panes.has(init.id)) throw new Error(`Dockable pane already registered: ${init.id}`)
    this.panes.set(init.id, {
      id: init.id,
      surface: init.surface,
      title: inferPaneTitle(init.id),
      floatingRect: init.floatingRect,
      state: "hidden",
      hostContainerId: null,
      leafId: null,
      lastDockContainerId: null,
      lastDockLeafId: null,
      floatingWindowId: null,
    })
  }

  createContainer() {
    const id = `Dock.Container.${this.nextContainerId++}`
    const surface = new DockWorkspaceSurface({
      id: `${id}.Surface`,
      containerId: id,
      driver: this,
    })
    const title = this.mainContainerId ? `Workspace ${this.nextContainerId - 1}` : "Workspace"
    const win = new DockingContainerWindow({
      id,
      title,
      x: this.mainContainerId ? 120 + (this.nextContainerId - 2) * 30 : 40,
      y: this.mainContainerId ? 90 + (this.nextContainerId - 2) * 30 : 40,
      w: this.mainContainerId ? 820 : 1220,
      h: this.mainContainerId ? 640 : 760,
      body: surface,
    })
    this.windows.register(win)
    this.containers.set(id, { id, title, root: null, surface, window: win })
    if (!this.mainContainerId) this.mainContainerId = id
    this.invalidate?.()
    return id
  }

  listPanes(): DockingPaneSnapshot[] {
    return [...this.panes.values()].map((pane) => ({
      id: pane.id,
      title: pane.title,
      state: pane.state,
      containerId: pane.hostContainerId,
    }))
  }

  listContainers(): DockingContainerSnapshot[] {
    return [...this.containers.values()].map((container) => ({ id: container.id, title: container.title }))
  }

  activatePane(id: string) {
    const pane = this.panes.get(id)
    if (!pane) return
    if (pane.state === "floating" && pane.floatingWindowId) {
      this.windows.focus(pane.floatingWindowId)
      this.invalidate?.()
      return
    }
    if (pane.state === "docked" && pane.hostContainerId) {
      this.selectPane(pane.hostContainerId, pane.id)
      this.windows.focus(pane.hostContainerId)
      this.invalidate?.()
      return
    }

    const containerId = pane.lastDockContainerId ?? this.mainContainerId
    if (!containerId) return
    const container = this.containers.get(containerId)
    if (!container) return
    const targetLeafId = pane.lastDockLeafId && findLeaf(container.root, pane.lastDockLeafId) ? pane.lastDockLeafId : firstLeaf(container.root)?.id ?? null
    this.dockPane(pane.id, containerId, targetLeafId, "center")
    this.windows.focus(containerId)
  }

  hidePane(id: string) {
    const pane = this.panes.get(id)
    if (!pane) return
    if (this.dragSession?.paneId === id) this.cancelDrag()
    if (pane.state === "floating") {
      this.destroyFloatingWindow(pane)
    } else if (pane.state === "docked" && pane.hostContainerId) {
      const container = this.containers.get(pane.hostContainerId)
      if (container) {
        container.root = removePane(container.root, pane.id)
      }
    }
    pane.state = "hidden"
    pane.hostContainerId = null
    pane.leafId = null
    this.invalidate?.()
  }

  floatPane(id: string, rect?: Rect, opts: { focus?: boolean } = {}) {
    const pane = this.panes.get(id)
    if (!pane) return
    if (pane.state === "floating") {
      if (rect && pane.floatingWindowId) {
        pane.floatingRect = rect
        this.windows.setRect(pane.floatingWindowId, rect)
      }
      if (opts.focus !== false && pane.floatingWindowId) this.windows.focus(pane.floatingWindowId)
      this.invalidate?.()
      return
    }
    if (pane.state === "docked" && pane.hostContainerId) {
      const container = this.containers.get(pane.hostContainerId)
      if (container) container.root = removePane(container.root, pane.id)
    }
    pane.state = "floating"
    pane.hostContainerId = null
    pane.leafId = null
    pane.floatingRect = rect ?? pane.floatingRect
    this.materializeFloatingWindow(pane, opts)
    this.invalidate?.()
  }

  dockPane(id: string, containerId: string, targetLeafId: string | null, placement: DockDropPlacement) {
    const pane = this.panes.get(id)
    const container = this.containers.get(containerId)
    if (!pane || !container) return

    if (pane.state === "floating") this.destroyFloatingWindow(pane)
    if (pane.state === "docked" && pane.hostContainerId) {
      const source = this.containers.get(pane.hostContainerId)
      if (source) source.root = removePane(source.root, pane.id)
    }

    container.root = insertPane(container.root, {
      targetLeafId,
      placement,
      paneId: pane.id,
      createId: (prefix) => `${prefix}.${this.nextNodeId++}`,
    })
    pane.state = "docked"
    pane.hostContainerId = containerId
    pane.leafId = findLeafByPane(container.root, pane.id)?.id ?? null
    pane.lastDockContainerId = containerId
    pane.lastDockLeafId = pane.leafId
    this.selectPane(containerId, pane.id)
    this.invalidate?.()
  }

  getRoot(containerId: string) {
    return this.containers.get(containerId)?.root ?? null
  }

  getPaneSurface(paneId: string) {
    const pane = this.panes.get(paneId)
    if (!pane) throw new Error(`Unknown dockable pane: ${paneId}`)
    return pane.surface
  }

  getPaneTitle(paneId: string) {
    return this.panes.get(paneId)?.title ?? inferPaneTitle(paneId)
  }

  getPreview(containerId: string) {
    const session = this.dragSession
    if (!session?.preview || session.preview.containerId !== containerId) return null
    return session.preview
  }

  selectPane(containerId: string, paneId: string) {
    const container = this.containers.get(containerId)
    if (!container?.root) return
    container.root = this.visitTabs(container.root, (leaf) => {
      if (!leaf.tabs.includes(paneId)) return leaf
      return { ...leaf, selectedPaneId: paneId }
    })
    const pane = this.panes.get(paneId)
    if (pane) {
      pane.state = "docked"
      pane.hostContainerId = containerId
      pane.leafId = findLeafByPane(container.root, paneId)?.id ?? null
      pane.lastDockContainerId = containerId
      pane.lastDockLeafId = pane.leafId
    }
    this.invalidate?.()
  }

  setSplitRatio(containerId: string, splitId: string, ratio: number) {
    const container = this.containers.get(containerId)
    if (!container?.root) return
    container.root = this.visitSplits(container.root, (split) => (split.id === splitId ? { ...split, ratio: clampRatio(ratio) } : split))
    this.invalidate?.()
  }

  beginDockedPaneDrag(containerId: string, paneId: string, pointer: Vec2) {
    const pane = this.panes.get(paneId)
    if (!pane || pane.state !== "docked" || !pane.hostContainerId || !pane.leafId) return
    this.dragSession = {
      paneId,
      source: { kind: "docked", containerId, leafId: pane.leafId },
      preview: null,
    }
    this.updateDrag(pointer)
  }

  beginFloatingPaneDrag(paneId: string, pointer: Vec2) {
    const pane = this.panes.get(paneId)
    if (!pane || pane.state !== "floating") return
    this.dragSession = {
      paneId,
      source: { kind: "floating", originRect: this.getFloatingWindowRect(pane) ?? pane.floatingRect, followPointer: false },
      preview: null,
    }
    this.updateDrag(pointer)
  }

  updateDrag(pointer: Vec2) {
    const session = this.dragSession
    if (!session) return
    if (session.source.kind === "docked" && this.shouldUndock(session, pointer)) {
      this.convertDockedDragToFloating(session.paneId, pointer)
    }
    if (!this.dragSession) return
    if (this.dragSession.source.kind === "floating" && this.dragSession.source.followPointer) {
      const pane = this.panes.get(this.dragSession.paneId)
      if (pane) {
        const rect = this.rectFromPointer(pointer, pane.floatingRect)
        pane.floatingRect = rect
        if (pane.floatingWindowId) this.windows.setRect(pane.floatingWindowId, rect)
      }
    }
    this.dragSession.preview = this.normalizePreview(this.dragSession, this.resolvePreview(pointer))
    this.invalidate?.()
  }

  endDrag(pointer: Vec2) {
    const session = this.dragSession
    if (!session) return
    const pane = this.panes.get(session.paneId)
    this.dragSession = null
    if (!pane) {
      this.invalidate?.()
      return
    }

    if (session.preview) {
      if (session.source.kind === "docked" && pane.hostContainerId === session.preview.containerId && pane.leafId === session.preview.leafId) {
        const currentLeaf = pane.leafId ? findLeaf(this.containers.get(pane.hostContainerId!)?.root ?? null, pane.leafId) : null
        if (session.preview.placement === "center" || (currentLeaf?.tabs.length ?? 0) <= 1) {
          this.cancelDrag(session)
          return
        }
      }
      this.dockPane(pane.id, session.preview.containerId, session.preview.leafId, session.preview.placement)
      this.windows.focus(session.preview.containerId)
      return
    }

    if (session.source.kind === "docked") {
      const rect = this.rectFromPointer(pointer, pane.floatingRect)
      this.floatPane(pane.id, rect)
      return
    }

    const nextRect = this.getFloatingWindowRect(pane) ?? this.rectFromPointer(pointer, pane.floatingRect)
    if (this.sameRect(nextRect, session.source.originRect)) {
      this.cancelDrag(session)
      return
    }
    pane.floatingRect = nextRect
    this.invalidate?.()
  }

  private cancelDrag(session: DragSession | null = this.dragSession) {
    if (!session) return
    if (this.dragSession === session) this.dragSession = null
    if (session.source.kind === "floating") {
      const pane = this.panes.get(session.paneId)
      if (pane) {
        pane.floatingRect = session.source.originRect
        if (pane.floatingWindowId) this.windows.setRect(pane.floatingWindowId, session.source.originRect)
      }
    }
    this.invalidate?.()
  }

  private normalizePreview(session: DragSession, preview: DockDropPreview | null) {
    if (!preview) return null
    if (session.source.kind !== "docked") return preview
    if (session.source.containerId !== preview.containerId || session.source.leafId !== preview.leafId) return preview

    const root = this.containers.get(session.source.containerId)?.root ?? null
    const sourceLeaf = findLeaf(root, session.source.leafId)
    const sourceTabCount = sourceLeaf?.tabs.length ?? 0
    if (preview.placement === "center") return null
    if (sourceTabCount <= 1) return null
    return preview
  }

  private cancelDragForWindowInterruption(windowId: string) {
    const session = this.dragSession
    if (!session) return
    const sourceWindowId = this.dragSourceWindowId(session)
    const previewWindowId = session.preview?.containerId ?? null
    if (windowId !== sourceWindowId && windowId !== previewWindowId) return
    this.cancelDrag(session)
  }

  private cancelDragForFocusChange(nextWindowId: string) {
    const session = this.dragSession
    if (!session) return
    if (nextWindowId === this.dragSourceWindowId(session)) return
    this.cancelDrag(session)
  }

  private resolvePreview(pointer: Vec2): DockDropPreview | null {
    for (const container of [...this.containers.values()].sort((a, b) => b.window.z - a.window.z)) {
      const body = container.window.getBodyBounds()
      if (!pointInRect(pointer, body)) continue
      const local = { x: pointer.x - body.x, y: pointer.y - body.y }
      return container.surface.resolveDropTarget(local)
    }
    return null
  }

  private shouldUndock(session: DragSession, pointer: Vec2) {
    if (session.source.kind !== "docked") return false
    const container = this.containers.get(session.source.containerId)
    if (!container) return false
    return !pointInRect(pointer, container.window.bounds())
  }

  private convertDockedDragToFloating(paneId: string, pointer: Vec2) {
    const pane = this.panes.get(paneId)
    if (!pane) return
    const rect = this.rectFromPointer(pointer, pane.floatingRect)
    this.floatPane(pane.id, rect, { focus: false })
    this.dragSession = {
      paneId: pane.id,
      source: { kind: "floating", originRect: rect, followPointer: true },
      preview: this.resolvePreview(pointer),
    }
  }

  private rectFromPointer(pointer: Vec2, basis: Rect): Rect {
    return {
      x: Math.round(pointer.x - Math.min(48, basis.w * 0.25)),
      y: Math.round(pointer.y - 16),
      w: basis.w,
      h: basis.h,
    }
  }

  private sameRect(a: Rect, b: Rect) {
    return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h
  }

  private dragSourceWindowId(session: DragSession) {
    if (session.source.kind === "docked") return session.source.containerId
    const pane = this.panes.get(session.paneId)
    return pane?.floatingWindowId ?? null
  }

  private materializeFloatingWindow(pane: DockablePaneState, opts: { focus?: boolean } = {}) {
    if (pane.floatingWindowId) {
      this.windows.setRect(pane.floatingWindowId, pane.floatingRect)
      if (opts.focus !== false) this.windows.focus(pane.floatingWindowId)
      return
    }

    const win = new FloatingPaneWindow({
      paneId: pane.id,
      title: pane.title,
      rect: pane.floatingRect,
      body: pane.surface,
      onHidePane: () => this.hidePane(pane.id),
    })
    win.setDragHooks({
      onTitleDragStart: (_window, pointer) => this.beginFloatingPaneDrag(pane.id, pointer),
      onTitleDragMove: (_window, pointer) => this.updateDrag(pointer),
      onTitleDragEnd: (_window, pointer) => {
        pane.floatingRect = this.getFloatingWindowRect(pane) ?? pane.floatingRect
        this.endDrag(pointer)
      },
      onTitleDragCancel: () => {
        this.cancelDrag()
      },
    })
    this.windows.register(win)
    pane.floatingWindowId = win.id
    if (opts.focus !== false) this.windows.focus(win.id)
  }

  private destroyFloatingWindow(pane: DockablePaneState) {
    if (!pane.floatingWindowId) return
    const rect = this.getFloatingWindowRect(pane)
    if (rect) pane.floatingRect = rect
    this.windows.unregister(pane.floatingWindowId)
    pane.floatingWindowId = null
  }

  private getFloatingWindowRect(pane: DockablePaneState): Rect | null {
    if (!pane.floatingWindowId) return null
    const win = this.windows.get(pane.floatingWindowId)
    if (!win) return null
    return { x: win.x.peek(), y: win.y.peek(), w: win.w.peek(), h: win.h.peek() }
  }

  private visitTabs(node: DockNode, fn: (node: Extract<DockNode, { kind: "tabs" }>) => Extract<DockNode, { kind: "tabs" }>): DockNode {
    if (node.kind === "tabs") return fn(node)
    return { ...node, a: this.visitTabs(node.a, fn), b: this.visitTabs(node.b, fn) }
  }

  private visitSplits(node: DockNode, fn: (node: Extract<DockNode, { kind: "split" }>) => Extract<DockNode, { kind: "split" }>): DockNode {
    if (node.kind === "tabs") return node
    const next = fn(node)
    return { ...next, a: this.visitSplits(next.a, fn), b: this.visitSplits(next.b, fn) }
  }
}
