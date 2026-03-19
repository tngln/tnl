import { classifySpatialClicks, createEventStream, type InteractionCancelReason } from "../event_stream"
import type { Rect } from "../draw"
import { UIElement, type DebugNodeRefSnapshot, type InvalidateRectOpts } from "./ui.element"

type ClickUpEvent = {
  target: UIElement
  pointerId: number
  x: number
  y: number
  button: number
  buttons: number
  altKey: boolean
  ctrlKey: boolean
  shiftKey: boolean
  metaKey: boolean
  timeStamp: number
}

export type DebugCanvasEventSnapshot = {
  at: number
  kind: string
  reason?: string
  pointerId?: number
  hitPath: DebugNodeRefSnapshot[]
  dispatchPath: DebugNodeRefSnapshot[]
}

export type DebugCanvasInvalidationSnapshot = {
  at: number
  rect: Rect
  pad: number
  force: boolean
  source: string
}

export type DebugPointerSessionSnapshot = {
  activePointerId: number | null
  hoverPath: DebugNodeRefSnapshot[]
  capturePath: DebugNodeRefSnapshot[]
  doubleClickWindowMs: number
  doubleClickDistanceSq: number
}

export type DebugFocusSessionSnapshot = {
  focusedPath: DebugNodeRefSnapshot[]
  reason: string | null
}

export type DebugCanvasRuntimeSnapshot = {
  pointer: DebugPointerSessionSnapshot
  focus: DebugFocusSessionSnapshot
  lastEvent: DebugCanvasEventSnapshot | null
  recentEvents: DebugCanvasEventSnapshot[]
  invalidations: DebugCanvasInvalidationSnapshot[]
}

const MAX_DEBUG_EVENTS = 12
const MAX_DEBUG_INVALIDATIONS = 12

function pathToRoot(node: UIElement | null) {
  const out: UIElement[] = []
  let current = node
  while (current) {
    out.push(current)
    current = current.parent
  }
  return out
}

function pathFromRoot(node: UIElement | null) {
  return pathToRoot(node).reverse().map((entry) => entry.debugRef())
}

function dispatchPath(node: UIElement | null) {
  return pathToRoot(node).map((entry) => entry.debugRef())
}

function pushCapped<T>(items: T[], value: T, maxEntries: number) {
  items.push(value)
  if (items.length > maxEntries) items.splice(0, items.length - maxEntries)
}

export class FocusSession {
  private target: UIElement | null = null
  private reason: string | null = null

  get focusedTarget() {
    return this.target
  }

  focus(target: UIElement | null, reason = "focus") {
    const previous = this.target
    if (previous === target) {
      this.reason = reason
      return { changed: false, previous, current: target }
    }
    this.target = target
    this.reason = reason
    previous?.emit("blur")
    target?.emit("focus")
    return { changed: true, previous, current: target }
  }

  snapshot(): DebugFocusSessionSnapshot {
    return {
      focusedPath: pathFromRoot(this.target),
      reason: this.reason,
    }
  }
}

export class PointerSession {
  private capture: UIElement | null = null
  private hover: UIElement | null = null
  private activePointerId: number | null = null
  private readonly clickUpEvents = createEventStream<ClickUpEvent>()
  private doubleClickSub: { unsubscribe(): void } | null = null

  constructor(
    private readonly opts: {
      doubleClickWindowMs: number
      doubleClickDistanceSq: number
      onDoubleClick: (event: ClickUpEvent) => void
    },
  ) {
    this.startDoubleClickClassifier()
  }

  get captureTarget() {
    return this.capture
  }

  get hoverTarget() {
    return this.hover
  }

  get pointerId() {
    return this.activePointerId
  }

  beginPointer(pointerId: number) {
    this.activePointerId = pointerId
  }

  clearPointer() {
    this.activePointerId = null
  }

  setCapture(target: UIElement | null) {
    this.capture = target
  }

  setHover(target: UIElement | null) {
    this.hover = target
  }

  emitClickUp(event: ClickUpEvent) {
    this.clickUpEvents.emit(event)
  }

  resetDoubleClickClassifier() {
    this.startDoubleClickClassifier()
  }

  destroy() {
    this.doubleClickSub?.unsubscribe()
    this.doubleClickSub = null
    this.capture = null
    this.hover = null
    this.activePointerId = null
  }

  snapshot(): DebugPointerSessionSnapshot {
    return {
      activePointerId: this.activePointerId,
      hoverPath: pathFromRoot(this.hover),
      capturePath: pathFromRoot(this.capture),
      doubleClickWindowMs: this.opts.doubleClickWindowMs,
      doubleClickDistanceSq: this.opts.doubleClickDistanceSq,
    }
  }

  private startDoubleClickClassifier() {
    this.doubleClickSub?.unsubscribe()
    this.doubleClickSub = classifySpatialClicks({
      clicks: this.clickUpEvents.stream,
      windowMs: this.opts.doubleClickWindowMs,
      distanceSq: this.opts.doubleClickDistanceSq,
      canPair: (first, second) => {
        if (first.target !== second.target) return false
        if (first.button !== 0 || second.button !== 0) return false
        if (first.pointerId !== second.pointerId) return false
        return true
      },
    }).subscribe((event) => {
      if (event.kind !== "double") return
      this.opts.onDoubleClick(event.second)
    })
  }
}

export class CanvasRuntimeDebugState {
  private lastEvent: DebugCanvasEventSnapshot | null = null
  private readonly recentEvents: DebugCanvasEventSnapshot[] = []
  private readonly invalidations: DebugCanvasInvalidationSnapshot[] = []

  recordEvent(opts: {
    kind: string
    hitTarget?: UIElement | null
    dispatchTarget?: UIElement | null
    pointerId?: number
    reason?: InteractionCancelReason | string
    at?: number
  }) {
    const entry: DebugCanvasEventSnapshot = {
      at: opts.at ?? Date.now(),
      kind: opts.kind,
      reason: opts.reason ?? undefined,
      pointerId: opts.pointerId,
      hitPath: pathFromRoot(opts.hitTarget ?? null),
      dispatchPath: dispatchPath(opts.dispatchTarget ?? null),
    }
    this.lastEvent = entry
    pushCapped(this.recentEvents, entry, MAX_DEBUG_EVENTS)
  }

  recordInvalidation(rect: Rect, opts: InvalidateRectOpts = {}) {
    const entry: DebugCanvasInvalidationSnapshot = {
      at: Date.now(),
      rect: { ...rect },
      pad: opts.pad ?? 0,
      force: !!opts.force,
      source: opts.source ?? "unknown",
    }
    pushCapped(this.invalidations, entry, MAX_DEBUG_INVALIDATIONS)
  }

  snapshot(pointer: DebugPointerSessionSnapshot, focus: DebugFocusSessionSnapshot): DebugCanvasRuntimeSnapshot {
    return {
      pointer,
      focus,
      lastEvent: this.lastEvent ? { ...this.lastEvent } : null,
      recentEvents: this.recentEvents.map((entry) => ({ ...entry })),
      invalidations: this.invalidations.map((entry) => ({ ...entry, rect: { ...entry.rect } })),
    }
  }
}
