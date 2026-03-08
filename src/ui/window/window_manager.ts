import { theme } from "../../config/theme"
import type { Vec2 } from "../base/ui"
import type { ModalWindow, Root, WindowSnapshot } from "./window"

export type WindowControlApi = {
  listWindows(): WindowSnapshot[]
  focus(id: string): void
  toggle(id: string): void
  open(id: string): void
  close(id: string): void
  minimize(id: string): void
  restore(id: string): void
  setRect(id: string, rect: { x: number; y: number; w: number; h: number }): void
}

export class WindowManager implements WindowControlApi {
  private readonly root: Root
  private readonly windows = new Map<string, ModalWindow>()
  private activeWindowId: string | null = null
  private canvasSize: Vec2 = { x: 0, y: 0 }

  constructor(root: Root) {
    this.root = root
  }

  register(win: ModalWindow) {
    if (this.windows.has(win.id)) throw new Error(`Window already registered: ${win.id}`)
    this.windows.set(win.id, win)
    this.root.add(win)
    win.setHooks({
      onStateChanged: () => this.onWindowStateChanged(win),
      onFocusRequested: () => this.focus(win.id),
    })
    win.z = this.windows.size
    if (win.open.peek() && !win.minimized.peek()) this.activeWindowId = win.id
    this.normalizeZ()
    this.layoutMinimizedTiles()
  }

  unregister(id: string) {
    const win = this.windows.get(id)
    if (!win) return
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

  listWindows(): WindowSnapshot[] {
    const ordered = [...this.windows.values()].sort((a, b) => a.z - b.z)
    return ordered.map((win) => win.snapshot(win.id === this.activeWindowId))
  }

  focus(id: string) {
    const win = this.windows.get(id)
    if (!win || !win.open.peek() || win.minimized.peek()) return
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
    win.closeWindow()
    if (this.activeWindowId === id) this.activeWindowId = null
    this.selectTopOpenWindow()
    this.layoutMinimizedTiles()
  }

  minimize(id: string) {
    const win = this.windows.get(id)
    if (!win) return
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
    this.layoutMinimizedTiles()
  }

  private onWindowStateChanged(win: ModalWindow) {
    if (!win.open.peek() || win.minimized.peek()) {
      if (this.activeWindowId === win.id) this.activeWindowId = null
      this.selectTopOpenWindow()
    }
    this.layoutMinimizedTiles()
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
}

export { WindowManager as WindowCoordinator }
