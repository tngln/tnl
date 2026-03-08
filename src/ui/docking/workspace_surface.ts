import { draw, Line, Rect as RectOp, RRect, Text } from "../../core/draw"
import { measureTextWidth } from "../../core/draw.text"
import { createEventStream, dragSession } from "../../core/event_stream"
import { createMachine, type Machine } from "../../core/fsm"
import { clamp } from "../../core/rect"
import { font, theme } from "../../config/theme"
import { PointerUIEvent, UIElement, pointInRect, type Rect, type Vec2 } from "../base/ui"
import { SurfaceRoot, ViewportElement, type Surface, type ViewportContext } from "../base/viewport"
import { clampRatio, type DockDropPlacement, type DockNode } from "./model"

export type DockDropPreview = {
  containerId: string
  leafId: string | null
  placement: DockDropPlacement
  rect: Rect
}

export type DockLeafDropLayout = {
  leafId: string
  rect: Rect
}

export type DockWorkspaceDriver = {
  getRoot(containerId: string): DockNode | null
  getPaneSurface(paneId: string): Surface
  getPaneTitle(paneId: string): string
  selectPane(containerId: string, paneId: string): void
  setSplitRatio(containerId: string, splitId: string, ratio: number): void
  beginDockedPaneDrag(containerId: string, paneId: string, pointer: Vec2): void
  updateDrag(pointer: Vec2): void
  endDrag(pointer: Vec2): void
  getPreview(containerId: string): DockDropPreview | null
}

type LeafLayout = {
  leafId: string
  rect: Rect
  headerRect: Rect
  contentRect: Rect
  tabs: Array<{ paneId: string; rect: Rect }>
}

type SplitLayout = {
  splitId: string
  axis: "x" | "y"
  rect: Rect
  gutterRect: Rect
}

const HEADER_H = 24
const SPLIT_GUTTER = 10
const MIN_PANE_EXTENT = 160
const TAB_GAP = 4
const TAB_PAD_X = 10

type DropCandidate = {
  leafId: string
  placement: DockDropPlacement
  rect: Rect
  score: number
}

type HandleState = "idle" | "pressed" | "dragging"
type HandleContext = { originPointer: Vec2; lastPointer: Vec2 }
type TabHandleEvent =
  | { type: "PRESS"; point: Vec2 }
  | { type: "DRAG_START"; point: Vec2 }
  | { type: "DRAG_MOVE"; point: Vec2 }
  | { type: "RELEASE"; point: Vec2 }
  | { type: "CANCEL" }
type SplitHandleEvent =
  | { type: "PRESS"; point: Vec2 }
  | { type: "DRAG_START"; point: Vec2 }
  | { type: "DRAG_MOVE"; point: Vec2 }
  | { type: "RELEASE"; point: Vec2 }

class DockTabHandle extends UIElement {
  private readonly rect: () => Rect
  private readonly title: () => string
  private readonly selected: () => boolean
  private readonly onSelect: () => void
  private readonly onDragStart: (pointer: Vec2) => void
  private readonly onDragMove: (pointer: Vec2) => void
  private readonly onDragEnd: (pointer: Vec2) => void
  private readonly toGlobal: (point: Vec2) => Vec2

  private hover = false
  private readonly downEvents = createEventStream<PointerUIEvent>()
  private readonly moveEvents = createEventStream<PointerUIEvent>()
  private readonly upEvents = createEventStream<PointerUIEvent>()
  private readonly cancelEvents = createEventStream<void>()
  private readonly machine: Machine<HandleState, TabHandleEvent, HandleContext>

  constructor(opts: {
    rect: () => Rect
    title: () => string
    selected: () => boolean
    onSelect: () => void
    onDragStart: (pointer: Vec2) => void
    onDragMove: (pointer: Vec2) => void
    onDragEnd: (pointer: Vec2) => void
    toGlobal: (point: Vec2) => Vec2
  }) {
    super()
    this.rect = opts.rect
    this.title = opts.title
    this.selected = opts.selected
    this.onSelect = opts.onSelect
    this.onDragStart = opts.onDragStart
    this.onDragMove = opts.onDragMove
    this.onDragEnd = opts.onDragEnd
    this.toGlobal = opts.toGlobal
    this.z = 20
    this.machine = createMachine<HandleState, TabHandleEvent, HandleContext>({
      initial: "idle",
      context: { originPointer: { x: 0, y: 0 }, lastPointer: { x: 0, y: 0 } },
      states: {
        idle: {
          on: {
            PRESS: {
              target: "pressed",
              reduce: (_snapshot: { state: HandleState; context: HandleContext }, event: Extract<TabHandleEvent, { type: "PRESS" }>) => ({
                originPointer: event.point,
                lastPointer: event.point,
              }),
            },
          },
        },
        pressed: {
          on: {
            DRAG_START: {
              target: "dragging",
              reduce: (_snapshot: { state: HandleState; context: HandleContext }, event: Extract<TabHandleEvent, { type: "DRAG_START" }>) => ({ lastPointer: event.point }),
              effect: (_snapshot: { state: HandleState; context: HandleContext }, event: Extract<TabHandleEvent, { type: "DRAG_START" }>) => {
                this.onDragStart(this.toGlobal(event.point))
              },
            },
            RELEASE: {
              target: "idle",
              reduce: (_snapshot: { state: HandleState; context: HandleContext }, event: Extract<TabHandleEvent, { type: "RELEASE" }>) => ({ lastPointer: event.point }),
            },
            CANCEL: {
              target: "idle",
            },
          },
        },
        dragging: {
          on: {
            DRAG_MOVE: {
              reduce: (_snapshot: { state: HandleState; context: HandleContext }, event: Extract<TabHandleEvent, { type: "DRAG_MOVE" }>) => ({ lastPointer: event.point }),
              effect: (_snapshot: { state: HandleState; context: HandleContext }, event: Extract<TabHandleEvent, { type: "DRAG_MOVE" }>) => {
                this.onDragMove(this.toGlobal(event.point))
              },
            },
            RELEASE: {
              target: "idle",
              reduce: (_snapshot: { state: HandleState; context: HandleContext }, event: Extract<TabHandleEvent, { type: "RELEASE" }>) => ({ lastPointer: event.point }),
              effect: (_snapshot: { state: HandleState; context: HandleContext }, event: Extract<TabHandleEvent, { type: "RELEASE" }>) => {
                this.onDragEnd(this.toGlobal(event.point))
              },
            },
            CANCEL: {
              target: "idle",
            },
          },
        },
      },
    })
    this.setupGestures()
  }

  bounds(): Rect {
    return this.rect()
  }

  protected containsPoint(p: Vec2) {
    return pointInRect(p, this.rect())
  }

  protected onDraw(ctx: CanvasRenderingContext2D) {
    const r = this.rect()
    const selected = this.selected()
    const active = this.machine.matches("pressed") || this.machine.matches("dragging")
    const bg = selected ? "rgba(255,255,255,0.08)" : active ? "rgba(255,255,255,0.05)" : this.hover ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.02)"
    draw(
      ctx,
      RRect(
        { x: r.x, y: r.y, w: r.w, h: r.h, r: 6 },
        {
          fill: { color: bg },
          stroke: { color: selected ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.08)", hairline: true },
          pixelSnap: true,
        },
      ),
      Text({
        x: r.x + r.w / 2,
        y: r.y + r.h / 2 + 0.5,
        text: this.title(),
        style: {
          color: selected ? theme.colors.textPrimary : theme.colors.textMuted,
          font: `${600} ${Math.max(10, theme.typography.body.size - 1)}px ${theme.typography.family}`,
          align: "center",
          baseline: "middle",
        },
      }),
    )
  }

  private setupGestures() {
    dragSession({
      down: this.downEvents.stream,
      move: this.moveEvents.stream,
      up: this.upEvents.stream,
      cancel: this.cancelEvents.stream,
      point: (event) => ({ x: event.x, y: event.y }),
      thresholdSq: 36,
    }).subscribe((event) => {
      if (event.kind === "start") {
        this.machine.send({ type: "DRAG_START", point: { x: event.current.x, y: event.current.y } })
        return
      }
      if (event.kind === "move") {
        this.machine.send({ type: "DRAG_MOVE", point: { x: event.current.x, y: event.current.y } })
        return
      }
      if (event.kind === "end") {
        this.machine.send({ type: "RELEASE", point: { x: event.up.x, y: event.up.y } })
        return
      }
      this.machine.send({ type: "CANCEL" })
    })
  }

  onPointerEnter() {
    this.hover = true
  }

  onPointerLeave() {
    this.hover = false
    if (this.machine.matches("pressed")) {
      this.cancelEvents.emit()
    }
  }

  onPointerDown(e: PointerUIEvent) {
    if (e.button !== 0) return
    this.machine.send({ type: "PRESS", point: { x: e.x, y: e.y } })
    this.downEvents.emit(e)
    e.capture()
  }

  onPointerMove(e: PointerUIEvent) {
    if (this.machine.matches("idle")) return
    this.moveEvents.emit(e)
  }

  onPointerUp(e: PointerUIEvent) {
    const wasPressed = this.machine.matches("pressed")
    const wasDragging = this.machine.matches("dragging")
    if (!wasPressed && !wasDragging) return
    this.upEvents.emit(e)
    if (wasDragging) return
    if (this.hover) this.onSelect()
  }
}

class DockSplitHandle extends UIElement {
  private readonly rect: () => Rect
  private readonly axis: () => "x" | "y"
  private readonly onDrag: (point: Vec2) => void
  private hover = false
  private readonly downEvents = createEventStream<PointerUIEvent>()
  private readonly moveEvents = createEventStream<PointerUIEvent>()
  private readonly upEvents = createEventStream<PointerUIEvent>()
  private readonly machine: Machine<HandleState, SplitHandleEvent, HandleContext>

  constructor(opts: { rect: () => Rect; axis: () => "x" | "y"; onDrag: (point: Vec2) => void }) {
    super()
    this.rect = opts.rect
    this.axis = opts.axis
    this.onDrag = opts.onDrag
    this.z = 15
    this.machine = createMachine<HandleState, SplitHandleEvent, HandleContext>({
      initial: "idle",
      context: { originPointer: { x: 0, y: 0 }, lastPointer: { x: 0, y: 0 } },
      states: {
        idle: {
          on: {
            PRESS: {
              target: "pressed",
              reduce: (_snapshot: { state: HandleState; context: HandleContext }, event: Extract<SplitHandleEvent, { type: "PRESS" }>) => ({
                originPointer: event.point,
                lastPointer: event.point,
              }),
            },
          },
        },
        pressed: {
          on: {
            DRAG_START: {
              target: "dragging",
              reduce: (_snapshot: { state: HandleState; context: HandleContext }, event: Extract<SplitHandleEvent, { type: "DRAG_START" }>) => ({ lastPointer: event.point }),
            },
            RELEASE: {
              target: "idle",
              reduce: (_snapshot: { state: HandleState; context: HandleContext }, event: Extract<SplitHandleEvent, { type: "RELEASE" }>) => ({ lastPointer: event.point }),
            },
          },
        },
        dragging: {
          on: {
            DRAG_MOVE: {
              reduce: (_snapshot: { state: HandleState; context: HandleContext }, event: Extract<SplitHandleEvent, { type: "DRAG_MOVE" }>) => ({ lastPointer: event.point }),
              effect: (_snapshot: { state: HandleState; context: HandleContext }, event: Extract<SplitHandleEvent, { type: "DRAG_MOVE" }>) => {
                this.onDrag(event.point)
              },
            },
            RELEASE: {
              target: "idle",
              reduce: (_snapshot: { state: HandleState; context: HandleContext }, event: Extract<SplitHandleEvent, { type: "RELEASE" }>) => ({ lastPointer: event.point }),
            },
          },
        },
      },
    })
    this.setupGestures()
  }

  bounds(): Rect {
    return this.rect()
  }

  protected containsPoint(p: Vec2) {
    return pointInRect(p, this.rect())
  }

  protected onDraw(ctx: CanvasRenderingContext2D) {
    const r = this.rect()
    const active = this.machine.matches("pressed") || this.machine.matches("dragging")
    const bg = active ? "rgba(255,255,255,0.08)" : this.hover ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.03)"
    const grip =
      this.axis() === "x"
        ? { x: r.x + Math.max(0, (r.w - 4) / 2), y: r.y + 8, w: 4, h: Math.max(0, r.h - 16), r: 2 }
        : { x: r.x + 8, y: r.y + Math.max(0, (r.h - 4) / 2), w: Math.max(0, r.w - 16), h: 4, r: 2 }

    draw(
      ctx,
      RRect({ x: r.x + 1, y: r.y + 1, w: Math.max(0, r.w - 2), h: Math.max(0, r.h - 2), r: 6 }, {
        fill: { color: bg },
        stroke: { color: "rgba(255,255,255,0.08)", hairline: true },
        pixelSnap: true,
      }),
      RRect(grip, { fill: { color: "rgba(255,255,255,0.18)" }, pixelSnap: true }),
    )
  }

  private setupGestures() {
    dragSession({
      down: this.downEvents.stream,
      move: this.moveEvents.stream,
      up: this.upEvents.stream,
      point: (event) => ({ x: event.x, y: event.y }),
      thresholdSq: 0,
    }).subscribe((event) => {
      if (event.kind === "start") {
        this.machine.send({ type: "DRAG_START", point: { x: event.current.x, y: event.current.y } })
        return
      }
      if (event.kind === "move") this.machine.send({ type: "DRAG_MOVE", point: { x: event.current.x, y: event.current.y } })
      if (event.kind === "end") this.machine.send({ type: "RELEASE", point: { x: event.up.x, y: event.up.y } })
    })
  }

  onPointerEnter() {
    this.hover = true
  }

  onPointerLeave() {
    this.hover = false
  }

  onPointerDown(e: PointerUIEvent) {
    if (e.button !== 0) return
    this.machine.send({ type: "PRESS", point: { x: e.x, y: e.y } })
    this.downEvents.emit(e)
    e.capture()
  }

  onPointerMove(e: PointerUIEvent) {
    if (this.machine.matches("idle")) return
    this.moveEvents.emit(e)
  }

  onPointerUp(e: PointerUIEvent) {
    if (this.machine.matches("idle")) return
    this.upEvents.emit(e)
  }
}

function tabWidth(ctx: CanvasRenderingContext2D, title: string) {
  const measured = measureTextWidth(ctx, title, `${600} ${Math.max(10, theme.typography.body.size - 1)}px ${theme.typography.family}`)
  return clamp(measured + TAB_PAD_X * 2, 72, 140)
}

function layoutDockTree(node: DockNode | null, rect: Rect, ctx: CanvasRenderingContext2D, driver: DockWorkspaceDriver, leaves: LeafLayout[], splits: SplitLayout[]) {
  if (!node) return
  if (node.kind === "tabs") {
    const headerRect = { x: rect.x, y: rect.y, w: rect.w, h: HEADER_H }
    const contentRect = { x: rect.x, y: rect.y + HEADER_H, w: rect.w, h: Math.max(0, rect.h - HEADER_H) }
    const tabs: Array<{ paneId: string; rect: Rect }> = []
    let cx = rect.x + 4
    const cy = rect.y + 2
    for (const paneId of node.tabs) {
      const title = driver.getPaneTitle(paneId)
      const w = tabWidth(ctx, title)
      tabs.push({ paneId, rect: { x: cx, y: cy, w, h: HEADER_H - 4 } })
      cx += w + TAB_GAP
    }
    leaves.push({ leafId: node.id, rect, headerRect, contentRect, tabs })
    return
  }

  const axis = node.axis
  const total = axis === "x" ? rect.w : rect.h
  const span = Math.max(MIN_PANE_EXTENT, total - MIN_PANE_EXTENT - SPLIT_GUTTER)
  const primary = clamp(total * clampRatio(node.ratio), MIN_PANE_EXTENT, span)

  if (axis === "x") {
    const aRect = { x: rect.x, y: rect.y, w: primary, h: rect.h }
    const gutterRect = { x: rect.x + primary, y: rect.y, w: SPLIT_GUTTER, h: rect.h }
    const bRect = { x: gutterRect.x + gutterRect.w, y: rect.y, w: Math.max(0, rect.w - primary - SPLIT_GUTTER), h: rect.h }
    splits.push({ splitId: node.id, axis, rect, gutterRect })
    layoutDockTree(node.a, aRect, ctx, driver, leaves, splits)
    layoutDockTree(node.b, bRect, ctx, driver, leaves, splits)
    return
  }

  const aRect = { x: rect.x, y: rect.y, w: rect.w, h: primary }
  const gutterRect = { x: rect.x, y: rect.y + primary, w: rect.w, h: SPLIT_GUTTER }
  const bRect = { x: rect.x, y: gutterRect.y + gutterRect.h, w: rect.w, h: Math.max(0, rect.h - primary - SPLIT_GUTTER) }
  splits.push({ splitId: node.id, axis, rect, gutterRect })
  layoutDockTree(node.a, aRect, ctx, driver, leaves, splits)
  layoutDockTree(node.b, bRect, ctx, driver, leaves, splits)
}

function insetRect(rect: Rect, inset: number): Rect {
  return {
    x: rect.x + inset,
    y: rect.y + inset,
    w: Math.max(0, rect.w - inset * 2),
    h: Math.max(0, rect.h - inset * 2),
  }
}

function inflateRect(rect: Rect, amount: number): Rect {
  return {
    x: rect.x - amount,
    y: rect.y - amount,
    w: rect.w + amount * 2,
    h: rect.h + amount * 2,
  }
}

function distanceToRect(point: Vec2, rect: Rect) {
  const dx = point.x < rect.x ? rect.x - point.x : point.x > rect.x + rect.w ? point.x - (rect.x + rect.w) : 0
  const dy = point.y < rect.y ? rect.y - point.y : point.y > rect.y + rect.h ? point.y - (rect.y + rect.h) : 0
  return Math.sqrt(dx * dx + dy * dy)
}

function edgeThreshold(layout: DockLeafDropLayout) {
  return clamp(Math.min(layout.rect.w, layout.rect.h) * 0.25, 28, 72)
}

function leafDropCandidates(layout: DockLeafDropLayout, point: Vec2): DropCandidate[] {
  const edge = edgeThreshold(layout)
  const expanded = inflateRect(layout.rect, Math.min(12, edge * 0.25))
  if (!pointInRect(point, expanded)) return []

  const leftZone = { x: layout.rect.x, y: layout.rect.y, w: edge, h: layout.rect.h }
  const rightZone = { x: layout.rect.x + layout.rect.w - edge, y: layout.rect.y, w: edge, h: layout.rect.h }
  const topZone = { x: layout.rect.x, y: layout.rect.y, w: layout.rect.w, h: edge }
  const bottomZone = { x: layout.rect.x, y: layout.rect.y + layout.rect.h - edge, w: layout.rect.w, h: edge }
  const centerZone = insetRect(layout.rect, edge)

  const candidates: DropCandidate[] = [
    {
      leafId: layout.leafId,
      placement: "left",
      rect: { x: layout.rect.x, y: layout.rect.y, w: layout.rect.w / 2, h: layout.rect.h },
      score: distanceToRect(point, leftZone),
    },
    {
      leafId: layout.leafId,
      placement: "right",
      rect: { x: layout.rect.x + layout.rect.w / 2, y: layout.rect.y, w: layout.rect.w / 2, h: layout.rect.h },
      score: distanceToRect(point, rightZone),
    },
    {
      leafId: layout.leafId,
      placement: "top",
      rect: { x: layout.rect.x, y: layout.rect.y, w: layout.rect.w, h: layout.rect.h / 2 },
      score: distanceToRect(point, topZone),
    },
    {
      leafId: layout.leafId,
      placement: "bottom",
      rect: { x: layout.rect.x, y: layout.rect.y + layout.rect.h / 2, w: layout.rect.w, h: layout.rect.h / 2 },
      score: distanceToRect(point, bottomZone),
    },
  ]

  if (pointInRect(point, centerZone)) {
    candidates.push({
      leafId: layout.leafId,
      placement: "center",
      rect: layout.rect,
      score: 0,
    })
  }

  return candidates
}

export function resolveDockDropPreview(containerId: string, size: Vec2, layouts: DockLeafDropLayout[], point: Vec2): DockDropPreview | null {
  if (!pointInRect(point, { x: 0, y: 0, w: size.x, h: size.y })) return null
  if (!layouts.length) {
    return {
      containerId,
      leafId: null,
      placement: "center",
      rect: { x: 0, y: 0, w: size.x, h: size.y },
    }
  }

  const candidates = layouts
    .flatMap((layout) => leafDropCandidates(layout, point))
    .sort((a, b) => a.score - b.score || placementPriority(a.placement) - placementPriority(b.placement))

  const best = candidates[0]
  if (!best) return null
  return {
    containerId,
    leafId: best.leafId,
    placement: best.placement,
    rect: best.rect,
  }
}

function placementPriority(placement: DockDropPlacement) {
  switch (placement) {
    case "center":
      return 0
    case "left":
      return 1
    case "right":
      return 2
    case "top":
      return 3
    case "bottom":
      return 4
  }
}

export class DockWorkspaceSurface implements Surface {
  readonly id: string
  private readonly containerId: string
  private readonly driver: DockWorkspaceDriver
  private readonly root = new SurfaceRoot()
  private lastViewport: ViewportContext | null = null
  private size: Vec2 = { x: 0, y: 0 }
  private readonly viewports = new Map<string, ViewportElement>()
  private readonly tabs = new Map<string, DockTabHandle>()
  private readonly splits = new Map<string, DockSplitHandle>()
  private readonly tabLeafByPane = new Map<string, string>()
  private leafLayouts = new Map<string, LeafLayout>()
  private splitLayouts = new Map<string, SplitLayout>()

  constructor(opts: { id: string; containerId: string; driver: DockWorkspaceDriver }) {
    this.id = opts.id
    this.containerId = opts.containerId
    this.driver = opts.driver
  }

  private toGlobal(point: Vec2): Vec2 {
    const vp = this.lastViewport
    if (!vp) return point
    return {
      x: vp.contentRect.x - vp.scroll.x + point.x,
      y: vp.contentRect.y - vp.scroll.y + point.y,
    }
  }

  private deactivateUnused(activeLeafs: Set<string>, activeTabs: Set<string>, activeSplits: Set<string>) {
    for (const [leafId, viewport] of this.viewports) {
      if (activeLeafs.has(leafId)) continue
      this.root.remove(viewport)
      this.viewports.delete(leafId)
    }
    for (const [paneId, tab] of this.tabs) {
      if (activeTabs.has(paneId)) continue
      this.root.remove(tab)
      this.tabs.delete(paneId)
    }
    for (const [splitId, handle] of this.splits) {
      if (activeSplits.has(splitId)) continue
      this.root.remove(handle)
      this.splits.delete(splitId)
    }
  }

  private ensureViewport(layout: LeafLayout, paneId: string) {
    let viewport = this.viewports.get(layout.leafId)
    if (!viewport) {
      viewport = new ViewportElement({
        rect: () => this.leafLayouts.get(layout.leafId)?.contentRect ?? { x: 0, y: 0, w: 0, h: 0 },
        target: this.driver.getPaneSurface(paneId),
        options: { clip: true, padding: theme.spacing.xs },
      })
      viewport.z = 1
      this.viewports.set(layout.leafId, viewport)
      this.root.add(viewport)
    }
    viewport.setTarget(this.driver.getPaneSurface(paneId))
  }

  private ensureTab(_layout: LeafLayout, paneId: string) {
    let tab = this.tabs.get(paneId)
    if (!tab) {
      tab = new DockTabHandle({
        rect: () => {
          const leafId = this.tabLeafByPane.get(paneId)
          if (!leafId) return { x: 0, y: 0, w: 0, h: 0 }
          return this.leafLayouts.get(leafId)?.tabs.find((entry) => entry.paneId === paneId)?.rect ?? { x: 0, y: 0, w: 0, h: 0 }
        },
        title: () => this.driver.getPaneTitle(paneId),
        selected: () => {
          const leafId = this.tabLeafByPane.get(paneId)
          if (!leafId) return false
          const containerRoot = this.driver.getRoot(this.containerId)
          if (!containerRoot) return false
          const current = findSelectedPane(containerRoot, leafId)
          return current === paneId
        },
        onSelect: () => this.driver.selectPane(this.containerId, paneId),
        onDragStart: (pointer) => this.driver.beginDockedPaneDrag(this.containerId, paneId, pointer),
        onDragMove: (pointer) => this.driver.updateDrag(pointer),
        onDragEnd: (pointer) => this.driver.endDrag(pointer),
        toGlobal: (point) => this.toGlobal(point),
      })
      this.tabs.set(paneId, tab)
      this.root.add(tab)
    }
  }

  private ensureSplit(layout: SplitLayout) {
    let handle = this.splits.get(layout.splitId)
    if (!handle) {
      handle = new DockSplitHandle({
        rect: () => this.splitLayouts.get(layout.splitId)?.gutterRect ?? { x: 0, y: 0, w: 0, h: 0 },
        axis: () => this.splitLayouts.get(layout.splitId)?.axis ?? "x",
        onDrag: (point) => this.onSplitDrag(layout.splitId, point),
      })
      this.splits.set(layout.splitId, handle)
      this.root.add(handle)
    }
  }

  private onSplitDrag(splitId: string, point: Vec2) {
    const layout = this.splitLayouts.get(splitId)
    if (!layout) return
    const total = layout.axis === "x" ? layout.rect.w : layout.rect.h
    const offset = layout.axis === "x" ? point.x - layout.rect.x : point.y - layout.rect.y
    const ratio = clampRatio(offset / Math.max(total, 1))
    this.driver.setSplitRatio(this.containerId, splitId, ratio)
  }

  resolveDropTarget(point: Vec2): DockDropPreview | null {
    return resolveDockDropPreview(
      this.containerId,
      this.size,
      [...this.leafLayouts.values()].map((layout) => ({ leafId: layout.leafId, rect: layout.rect })),
      point,
    )
  }

  render(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, viewport: ViewportContext) {
    this.lastViewport = viewport
    this.size = { x: viewport.contentRect.w, y: viewport.contentRect.h }
    const root = this.driver.getRoot(this.containerId)
    const leaves: LeafLayout[] = []
    const splits: SplitLayout[] = []
    layoutDockTree(root, { x: 0, y: 0, w: this.size.x, h: this.size.y }, ctx as CanvasRenderingContext2D, this.driver, leaves, splits)
    this.leafLayouts = new Map(leaves.map((entry) => [entry.leafId, entry]))
    this.splitLayouts = new Map(splits.map((entry) => [entry.splitId, entry]))

    draw(
      ctx as CanvasRenderingContext2D,
      RRect({ x: 0, y: 0, w: this.size.x, h: this.size.y, r: theme.radii.sm }, {
        fill: { color: "rgba(255,255,255,0.015)" },
        stroke: { color: "rgba(255,255,255,0.08)", hairline: true },
        pixelSnap: true,
      }),
    )

    for (const layout of leaves) {
      draw(
        ctx as CanvasRenderingContext2D,
        RRect({ x: layout.rect.x, y: layout.rect.y, w: layout.rect.w, h: layout.rect.h, r: theme.radii.sm }, {
          fill: { color: "rgba(255,255,255,0.02)" },
          stroke: { color: "rgba(255,255,255,0.08)", hairline: true },
          pixelSnap: true,
        }),
        RectOp(layout.headerRect, { fill: { color: "rgba(255,255,255,0.018)" } }),
        Line(
          { x: layout.headerRect.x, y: layout.headerRect.y + layout.headerRect.h },
          { x: layout.headerRect.x + layout.headerRect.w, y: layout.headerRect.y + layout.headerRect.h },
          { color: "rgba(255,255,255,0.10)", hairline: true },
        ),
      )
    }

    const preview = this.driver.getPreview(this.containerId)
    if (preview) {
      draw(
        ctx as CanvasRenderingContext2D,
        RRect({ x: preview.rect.x, y: preview.rect.y, w: preview.rect.w, h: preview.rect.h, r: theme.radii.sm }, {
          fill: { color: "rgba(100,160,255,0.12)" },
          stroke: { color: "rgba(120,180,255,0.48)", width: 2 },
          pixelSnap: true,
        }),
      )
    }

    const activeLeafs = new Set<string>()
    const activeTabs = new Set<string>()
    const activeSplits = new Set<string>()
    this.tabLeafByPane.clear()

    for (const layout of leaves) {
      const selectedPaneId = findSelectedPane(root, layout.leafId)
      if (selectedPaneId) {
        activeLeafs.add(layout.leafId)
        this.ensureViewport(layout, selectedPaneId)
      }
      for (const tab of layout.tabs) {
        this.tabLeafByPane.set(tab.paneId, layout.leafId)
        activeTabs.add(tab.paneId)
        this.ensureTab(layout, tab.paneId)
      }
    }

    for (const split of splits) {
      activeSplits.add(split.splitId)
      this.ensureSplit(split)
    }

    this.root.draw(ctx as CanvasRenderingContext2D)
    this.deactivateUnused(activeLeafs, activeTabs, activeSplits)
  }

  hitTest(pSurface: Vec2) {
    return this.root.hitTest(pSurface)
  }
}

function findSelectedPane(root: DockNode | null, leafId: string): string | null {
  if (!root) return null
  if (root.kind === "tabs") return root.id === leafId ? root.selectedPaneId : null
  return findSelectedPane(root.a, leafId) ?? findSelectedPane(root.b, leafId)
}
