import { draw, RRect } from "../../core/draw"
import { theme } from "../../config/theme"
import { type Rect as BoundsRect, type Vec2, UIElement } from "../base/ui"
import { ModalWindow, type Root, type WindowSnapshot } from "./window"

export type WindowControlApi = {
  listWindows(): WindowSnapshot[]
  getActiveWindowId(): string | null
  focus(id: string): void
  toggle(id: string): void
  open(id: string): void
  close(id: string): void
  minimize(id: string): void
  restore(id: string): void
  maximize(id: string): void
  toggleMaximize(id: string): void
  setRect(id: string, rect: { x: number; y: number; w: number; h: number }): void
}

type WindowManagerListener = {
  onBeforeFocus?: (nextId: string, prevId: string | null) => void
  onBeforeClose?: (id: string) => void
  onBeforeMinimize?: (id: string) => void
  onBeforeUnregister?: (id: string) => void
}

type SnapTarget =
  | { kind: "maximize"; rect: BoundsRect }
  | { kind: "left-half"; rect: BoundsRect }
  | { kind: "right-half"; rect: BoundsRect }

class SnapPreviewOverlay extends UIElement {
  private rect: BoundsRect | null = null

  constructor() {
    super()
    this.z = 1_000_000
  }

  setRect(rect: BoundsRect | null) {
    this.rect = rect
  }

  bounds(): BoundsRect {
    return this.rect ?? { x: 0, y: 0, w: 0, h: 0 }
  }

  protected containsPoint() {
    return false
  }

  protected onDraw(ctx: CanvasRenderingContext2D) {
    if (!this.rect) return
    draw(
      ctx,
      RRect(
        { x: this.rect.x, y: this.rect.y, w: this.rect.w, h: this.rect.h, r: theme.radii.sm },
        {
          fill: { color: "rgba(100,160,255,0.12)" },
          stroke: { color: "rgba(120,180,255,0.48)", width: 2 },
          pixelSnap: true,
        },
      ),
    )
  }
}

export class WindowManager implements WindowControlApi {
  private readonly root: Root
  private readonly windows = new Map<string, ModalWindow>()
  private readonly listeners = new Set<WindowManagerListener>()
  private readonly activeTitleDrags = new Map<string, boolean>()
  private readonly snapPreview = new SnapPreviewOverlay()
  private snapPreviewTarget: SnapTarget | null = null
  private activeWindowId: string | null = null
  private canvasSize: Vec2 = { x: 0, y: 0 }

  constructor(root: Root) {
    this.root = root
    this.root.add(this.snapPreview)
  }

  registerOverlay(el: UIElement) {
    this.root.add(el)
    return () => {
      if (el.parent === this.root) this.root.remove(el)
    }
  }

  register(win: ModalWindow) {
    if (this.windows.has(win.id)) throw new Error(`Window already registered: ${win.id}`)
    this.windows.set(win.id, win)
    this.root.add(win)
    win.setMaximizeBounds(this.maximizeRect())
    win.setHooks({
      onStateChanged: () => this.onWindowStateChanged(win),
      onFocusRequested: () => this.focus(win.id),
      onTitleDragStart: (dragged) => {
        this.activeTitleDrags.set(dragged.id, false)
        this.setSnapPreview(null)
      },
      onTitleDragMove: (dragged, pointer) => {
        this.activeTitleDrags.set(dragged.id, true)
        this.setSnapPreview(this.resolveSnapTarget(pointer))
      },
      onTitleDragEnd: (dragged, pointer) => this.onWindowTitleDragEnd(dragged, pointer),
      onTitleDragCancel: (dragged) => {
        this.activeTitleDrags.delete(dragged.id)
        this.setSnapPreview(null)
      },
    })
    win.z = this.windows.size
    if (win.open.peek() && !win.minimized.peek()) this.activeWindowId = win.id
    this.normalizeZ()
    this.layoutMinimizedTiles()
  }

  unregister(id: string) {
    const win = this.windows.get(id)
    if (!win) return
    for (const listener of this.listeners) listener.onBeforeUnregister?.(id)
    win.setHooks(null)
    if (win.parent === this.root) this.root.remove(win)
    this.windows.delete(id)
    if (this.activeWindowId === id) this.activeWindowId = null
    this.selectTopOpenWindow()
    this.normalizeZ()
    this.layoutMinimizedTiles()
  }

  get(id: string) {
    return this.windows.get(id) ?? null
  }

  addListener(listener: WindowManagerListener) {
    this.listeners.add(listener)
  }

  removeListener(listener: WindowManagerListener) {
    this.listeners.delete(listener)
  }

  listWindows(): WindowSnapshot[] {
    const ordered = [...this.windows.values()].sort((a, b) => a.z - b.z)
    return ordered.map((win) => win.snapshot(win.id === this.activeWindowId))
  }

  getActiveWindowId() {
    return this.activeWindowId
  }

  getSnapPreviewRect() {
    return this.snapPreviewTarget?.rect ?? null
  }

  focus(id: string) {
    const win = this.windows.get(id)
    if (!win || !win.open.peek() || win.minimized.peek()) return
    if (this.activeWindowId !== id) {
      for (const listener of this.listeners) listener.onBeforeFocus?.(id, this.activeWindowId)
    }
    this.activeWindowId = id
    const maxZ = [...this.windows.values()].reduce((max, entry) => Math.max(max, entry.z), 0)
    win.z = maxZ + 1
    this.normalizeZ()
  }

  toggle(id: string) {
    const win = this.windows.get(id)
    if (!win) return
    if (win.open.peek()) this.close(id)
    else this.open(id)
  }

  open(id: string) {
    const win = this.windows.get(id)
    if (!win) return
    win.openWindow()
    if (!win.minimized.peek()) this.focus(id)
    this.layoutMinimizedTiles()
  }

  close(id: string) {
    const win = this.windows.get(id)
    if (!win) return
    for (const listener of this.listeners) listener.onBeforeClose?.(id)
    win.closeWindow()
    if (this.activeWindowId === id) this.activeWindowId = null
    this.selectTopOpenWindow()
    this.layoutMinimizedTiles()
  }

  minimize(id: string) {
    const win = this.windows.get(id)
    if (!win) return
    for (const listener of this.listeners) listener.onBeforeMinimize?.(id)
    win.minimize()
    if (this.activeWindowId === id) this.activeWindowId = null
    this.selectTopOpenWindow()
    this.layoutMinimizedTiles()
  }

  restore(id: string) {
    const win = this.windows.get(id)
    if (!win) return
    win.restore()
    this.focus(id)
    this.layoutMinimizedTiles()
  }

  maximize(id: string) {
    const win = this.windows.get(id)
    if (!win) return
    if (!win.open.peek()) win.openWindow()
    if (win.minimized.peek()) win.restore()
    win.setMaximizeBounds(this.maximizeRect())
    win.maximize()
    this.focus(id)
  }

  toggleMaximize(id: string) {
    const win = this.windows.get(id)
    if (!win) return
    if (!win.open.peek()) win.openWindow()
    if (win.minimized.peek()) win.restore()
    win.setMaximizeBounds(this.maximizeRect())
    win.toggleMaximize()
    if (win.open.peek() && !win.minimized.peek()) this.focus(id)
  }

  setRect(id: string, rect: { x: number; y: number; w: number; h: number }) {
    const win = this.windows.get(id)
    if (!win) return
    win.setWindowRect(rect)
  }

  onWindowPointerDown(win: ModalWindow) {
    this.focus(win.id)
  }

  setCanvasSize(size: Vec2) {
    this.canvasSize = size
    const maximizeBounds = this.maximizeRect()
    for (const win of this.windows.values()) win.setMaximizeBounds(maximizeBounds)
    this.layoutMinimizedTiles()
  }

  private onWindowStateChanged(win: ModalWindow) {
    if (this.snapPreviewTarget && this.activeWindowId === win.id) this.setSnapPreview(null)
    if (!win.open.peek() || win.minimized.peek()) {
      if (this.activeWindowId === win.id) this.activeWindowId = null
      this.selectTopOpenWindow()
    }
    this.layoutMinimizedTiles()
  }

  private onWindowTitleDragEnd(win: ModalWindow, pointer: Vec2) {
    const moved = this.activeTitleDrags.get(win.id) === true
    this.activeTitleDrags.delete(win.id)
    const snap = this.snapPreviewTarget ?? this.resolveSnapTarget(pointer)
    this.setSnapPreview(null)
    if (!moved) return
    if (!snap || !win.resizable || win.minimized.peek() || !win.open.peek()) return
    if (snap.kind === "maximize") {
      win.setMaximizeBounds(this.maximizeRect())
      win.maximize()
      return
    }
    if (snap.kind === "left-half") {
      win.useLeftHalfScreen(snap.rect)
      return
    }
    win.useRightHalfScreen(snap.rect)
  }

  private selectTopOpenWindow() {
    const ordered = [...this.windows.values()]
      .filter((win) => win.open.peek() && !win.minimized.peek())
      .sort((a, b) => a.z - b.z)
    this.activeWindowId = ordered.length ? ordered[ordered.length - 1].id : null
  }

  private normalizeZ() {
    const ordered = [...this.windows.values()].sort((a, b) => a.z - b.z)
    for (let i = 0; i < ordered.length; i++) ordered[i].z = i + 1
    this.root.children.sort((a, b) => a.z - b.z)
  }

  private layoutMinimizedTiles() {
    const cssW = this.canvasSize.x
    const cssH = this.canvasSize.y
    if (cssW <= 0 || cssH <= 0) return

    const pad = theme.spacing.sm
    const gap = theme.spacing.xs
    const tileH = 26
    const tileW = 220
    const minimized = [...this.windows.values()]
      .filter((win) => win.open.peek() && win.minimized.peek())
      .sort((a, b) => a.minimizedOrder - b.minimizedOrder)

    let cx = pad
    let cy = cssH - pad - tileH
    for (const win of minimized) {
      if (cx + tileW > cssW - pad && cx > pad) {
        cx = pad
        cy -= tileH + gap
      }
      win.setMinimizedRect({ x: cx, y: cy, w: tileW, h: tileH })
      cx += tileW + gap
    }
  }

  private maximizeRect() {
    return { x: 0, y: 0, w: Math.max(0, this.canvasSize.x), h: Math.max(0, this.canvasSize.y) }
  }

  private setSnapPreview(target: SnapTarget | null) {
    this.snapPreviewTarget = target
    this.snapPreview.setRect(target?.rect ?? null)
  }

  private resolveSnapTarget(pointer: Vec2): SnapTarget | null {
    const width = Math.max(0, this.canvasSize.x)
    const height = Math.max(0, this.canvasSize.y)
    if (width <= 0 || height <= 0) return null

    const threshold = 24
    if (pointer.y <= threshold) return { kind: "maximize", rect: this.maximizeRect() }

    const halfWidth = Math.floor(width / 2)
    if (pointer.x <= threshold) {
      return {
        kind: "left-half",
        rect: { x: 0, y: 0, w: halfWidth, h: height },
      }
    }
    if (pointer.x >= width - threshold) {
      return {
        kind: "right-half",
        rect: { x: halfWidth, y: 0, w: width - halfWidth, h: height },
      }
    }
    return null
  }
}

export { WindowManager as WindowCoordinator }
