import type { InteractionCancelReason } from "../../core/event_stream"
import type { Surface } from "../base/viewport"
import { pointInRect, type Rect, type Vec2 } from "../base/ui"
import { DragDropController, type ActiveDragSession, type DragBehavior, type DragImageSpec, type DragPayload, type DropCandidate, type DropProvider } from "../base/drag_drop"
import { DragImageOverlay } from "../base/drag_drop_overlay"
import { SurfaceWindow } from "../window/window"
import { type WindowManager } from "../window/window_manager"
import { clampRatio, findLeaf, findLeafByPane, firstLeaf, insertPane, removePane, type DockDropPlacement, type DockNode } from "./model"
import { DockWorkspaceSurface, type DockDropPreview, type DockWorkspaceDriver } from "./workspace_surface"

type DockPaneDragPayload = {
  paneId: string
  source:
    | { kind: "docked"; containerId: string; leafId: string | null }
    | { kind: "floating"; originRect: Rect; followPointer: boolean }
}

declare module "../base/drag_drop" {
  interface DragPayloadByKind {
    "dock.pane": DockPaneDragPayload
  }
}

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
  getActivePaneId(): string | null
  getActiveContainerId(): string | null
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
  dragImage: DragImageSpec | (() => DragImageSpec) | null
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

type DockingManagerOptions = {
  windows: WindowManager
}

export type DockablePaneInit = {
  id: string
  surface: Surface
  floatingRect: Rect
  dragImage?: DragImageSpec | (() => DragImageSpec)
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
  private readonly drag = new DragDropController()
  private readonly dragPointerId = 1
  private nextContainerId = 1
  private nextNodeId = 1
  private mainContainerId: string | null = null
  private activePaneId: string | null = null
  private activeContainerId: string | null = null
  private readonly windowListener = {
    onBeforeFocus: (nextId: string) => this.cancelDragForFocusChange(nextId),
    onBeforeClose: (id: string) => this.cancelDragForWindowInterruption(id),
    onBeforeMinimize: (id: string) => this.cancelDragForWindowInterruption(id),
    onBeforeUnregister: (id: string) => this.cancelDragForWindowInterruption(id),
  }

  constructor(opts: DockingManagerOptions) {
    this.windows = opts.windows
    this.windows.addListener(this.windowListener)
    this.windows.registerOverlay(new DragImageOverlay(this.drag))
    this.drag.registerProvider({
      id: "dock.targets",
      orderKey: () => 100,
      resolve: (session, pGlobal) => this.resolveDockTargets(session, pGlobal),
    })
    this.drag.registerProvider({
      id: "dock.fallback",
      orderKey: () => 0,
      resolve: (session, pGlobal) => this.resolveDockFallback(session, pGlobal),
    })
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
      dragImage: init.dragImage ?? null,
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

  getActivePaneId() {
    return this.activePaneId
  }

  getActiveContainerId() {
    return this.activeContainerId
  }

  activatePane(id: string) {
    const pane = this.panes.get(id)
    if (!pane) return
    if (pane.state === "floating" && pane.floatingWindowId) {
      this.activePaneId = pane.id
      this.activeContainerId = null
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
    if (this.activeDockPayload()?.paneId === id) this.cancelDrag()
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
    if (this.activePaneId === id) {
      this.activePaneId = null
      this.activeContainerId = null
    }
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
    this.activePaneId = pane.id
    this.activeContainerId = null
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
    this.activePaneId = pane.id
    this.activeContainerId = containerId
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
    const active = this.activeDockSession()
    if (!active) return null
    const data = active.candidate?.preview?.data as DockDropPreview | undefined
    if (!data || data.containerId !== containerId) return null
    return data
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
    this.activePaneId = paneId
    this.activeContainerId = containerId
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
    if (!pane || pane.state !== "docked" || !pane.hostContainerId) return
    const payload: DockPaneDragPayload = {
      paneId,
      source: { kind: "docked", containerId, leafId: pane.leafId },
    }
    const dragImage = typeof pane.dragImage === "function" ? pane.dragImage() : pane.dragImage
    this.drag.begin({
      kind: "dock.pane",
      payload,
      pointerId: this.dragPointerId,
      start: pointer,
      behavior: this.createDockDragBehavior(payload),
      dragImage,
    })
    this.updateDrag(pointer)
  }

  beginFloatingPaneDrag(paneId: string, pointer: Vec2) {
    const pane = this.panes.get(paneId)
    if (!pane || pane.state !== "floating") return
    const payload: DockPaneDragPayload = {
      paneId,
      source: { kind: "floating", originRect: this.getFloatingWindowRect(pane) ?? pane.floatingRect, followPointer: false },
    }
    this.drag.begin({
      kind: "dock.pane",
      payload,
      pointerId: this.dragPointerId,
      start: pointer,
      behavior: this.createDockDragBehavior(payload),
      // Title-bar dragging a floating tool window is primarily "move the window".
      // We only show a drag image once we are actually hovering a docking target.
      dragImage: null,
    })
    this.updateDrag(pointer)
  }

  updateDrag(pointer: Vec2) {
    if (!this.activeDockSession()) return
    this.drag.move(this.dragPointerId, pointer, 1)
    this.syncDockDragImage()
    this.invalidate?.()
  }

  endDrag(pointer: Vec2) {
    if (!this.activeDockSession()) return
    this.drag.end(this.dragPointerId, pointer)
    this.invalidate?.()
  }

  private cancelDrag(reason: "inactive" | InteractionCancelReason | (string & {}) = "inactive") {
    if (!this.activeDockSession()) return
    this.drag.cancel(reason)
    this.invalidate?.()
  }

  private cancelDragForWindowInterruption(windowId: string) {
    const session = this.activeDockSession()
    if (!session) return
    const payload = session.payload
    const sourceWindowId =
      payload.source.kind === "docked" ? payload.source.containerId : this.panes.get(payload.paneId)?.floatingWindowId ?? null
    const previewWindowId = (session.candidate?.preview?.data as DockDropPreview | undefined)?.containerId ?? null
    if (windowId !== sourceWindowId && windowId !== previewWindowId) return
    this.cancelDrag("inactive")
  }

  private cancelDragForFocusChange(nextWindowId: string) {
    const session = this.activeDockSession()
    if (!session) return
    const payload = session.payload
    const sourceWindowId =
      payload.source.kind === "docked" ? payload.source.containerId : this.panes.get(payload.paneId)?.floatingWindowId ?? null
    if (nextWindowId === sourceWindowId) return
    this.cancelDrag("inactive")
  }

  private activeDockSession(): ActiveDragSession<"dock.pane"> | null {
    const active = this.drag.getActive()
    if (!active || active.kind !== "dock.pane") return null
    return active as ActiveDragSession<"dock.pane">
  }

  private activeDockPayload(): DockPaneDragPayload | null {
    return this.activeDockSession()?.payload ?? null
  }

  private syncDockDragImage() {
    const session = this.activeDockSession()
    if (!session) return
    const payload = session.payload
    if (payload.source.kind !== "floating") return

    const wants = session.candidate?.preview?.style === "dock"
    if (wants) {
      if (session.dragImage) return
      const pane = this.panes.get(payload.paneId)
      if (!pane?.dragImage) return
      const spec = typeof pane.dragImage === "function" ? pane.dragImage() : pane.dragImage
      this.drag.setDragImage(spec ?? null)
      return
    }
    if (session.dragImage) this.drag.setDragImage(null)
  }

  private createDockDragBehavior(payload: DockPaneDragPayload): DragBehavior<"dock.pane"> {
    return {
      onMove: (pointer) => {
        if (payload.source.kind === "docked" && this.shouldUndockDockedPayload(payload, pointer)) {
          this.convertDockedPayloadToFloating(payload, pointer)
        }
        if (payload.source.kind === "floating" && payload.source.followPointer) {
          const pane = this.panes.get(payload.paneId)
          if (!pane) return
          const rect = this.rectFromPointer(pointer, pane.floatingRect)
          pane.floatingRect = rect
          if (pane.floatingWindowId) this.windows.setRect(pane.floatingWindowId, rect)
        }
      },
      onCancel: () => {
        if (payload.source.kind !== "floating") return
        const pane = this.panes.get(payload.paneId)
        if (!pane) return
        pane.floatingRect = payload.source.originRect
        if (pane.floatingWindowId) this.windows.setRect(pane.floatingWindowId, payload.source.originRect)
      },
    }
  }

  private shouldUndockDockedPayload(payload: DockPaneDragPayload, pointer: Vec2) {
    if (payload.source.kind !== "docked") return false
    const container = this.containers.get(payload.source.containerId)
    if (!container) return false
    return !pointInRect(pointer, container.window.bounds())
  }

  private convertDockedPayloadToFloating(payload: DockPaneDragPayload, pointer: Vec2) {
    const pane = this.panes.get(payload.paneId)
    if (!pane) return
    const rect = this.rectFromPointer(pointer, pane.floatingRect)
    this.floatPane(pane.id, rect, { focus: false })
    payload.source = { kind: "floating", originRect: rect, followPointer: true }
  }

  private resolveDockTargets(session: ActiveDragSession, pointer: Vec2): DropCandidate | null {
    if (session.kind !== "dock.pane") return null
    const payload = session.payload as DragPayload<"dock.pane">
    for (const container of [...this.containers.values()].sort((a, b) => b.window.z - a.window.z)) {
      const body = container.window.getBodyBounds()
      if (!pointInRect(pointer, body)) continue
      const local = { x: pointer.x - body.x, y: pointer.y - body.y }
      const preview = container.surface.resolveDropTarget(local)
      const normalized = this.normalizeDockPreview(payload, preview)
      if (!normalized) return null
      const targetId = `dock:${normalized.containerId}:${normalized.leafId ?? "root"}:${normalized.placement}`
      return {
        targetId,
        effect: "move",
        preview: { rect: normalized.rect, style: "dock", data: normalized },
        commit: () => {
          this.dockPane(payload.paneId, normalized.containerId, normalized.leafId, normalized.placement)
          this.windows.focus(normalized.containerId)
        },
      }
    }
    return null
  }

  private resolveDockFallback(session: ActiveDragSession, pointer: Vec2): DropCandidate | null {
    if (session.kind !== "dock.pane") return null
    const payload = session.payload as DragPayload<"dock.pane">
    const pane = this.panes.get(payload.paneId)
    if (!pane) return null
    if (payload.source.kind === "docked") {
      return {
        targetId: `dock.float:${payload.paneId}`,
        effect: "move",
        commit: () => {
          const rect = this.rectFromPointer(pointer, pane.floatingRect)
          this.floatPane(pane.id, rect)
        },
      }
    }
    return {
      targetId: `dock.fallback:${payload.paneId}`,
      effect: "none",
      commit: () => {
        if (payload.source.kind !== "floating") return
        const nextRect = this.getFloatingWindowRect(pane) ?? this.rectFromPointer(pointer, pane.floatingRect)
        if (this.sameRect(nextRect, payload.source.originRect)) {
          pane.floatingRect = payload.source.originRect
          if (pane.floatingWindowId) this.windows.setRect(pane.floatingWindowId, payload.source.originRect)
          return
        }
        pane.floatingRect = nextRect
      },
    }
  }

  private normalizeDockPreview(payload: DockPaneDragPayload, preview: DockDropPreview | null) {
    if (!preview) return null
    if (payload.source.kind !== "docked") return preview
    if (payload.source.containerId !== preview.containerId || payload.source.leafId !== preview.leafId) return preview
    const root = this.containers.get(payload.source.containerId)?.root ?? null
    const sourceLeaf = payload.source.leafId ? findLeaf(root, payload.source.leafId) : null
    const sourceTabCount = sourceLeaf?.tabs.length ?? 0
    if (preview.placement === "center") return null
    if (sourceTabCount <= 1) return null
    return preview
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
