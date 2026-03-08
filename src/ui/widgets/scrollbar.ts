import { draw, RRect } from "../../core/draw"
import { createEventStream, dragSession } from "../../core/event_stream"
import { createMachine, type Machine } from "../../core/fsm"
import { clamp } from "../../core/rect"
import { theme } from "../../config/theme"
import { PointerUIEvent, UIElement, pointInRect, type Rect, type Vec2 } from "../base/ui"

type Axis = "x" | "y"

type ThumbMetrics = {
  maxValue: number
  trackLength: number
  thumbLength: number
  thumbOffset: number
}

type ScrollbarState = "idle" | "pressed" | "dragging"
type ScrollbarContext = {
  originPointer: Vec2
  lastPointer: Vec2
  dragOffset: number
}
type ScrollbarEvent =
  | { type: "PRESS"; pointer: Vec2; dragOffset: number }
  | { type: "DRAG_START"; pointer: Vec2 }
  | { type: "DRAG_MOVE"; pointer: Vec2 }
  | { type: "RELEASE"; pointer: Vec2 }
  | { type: "CANCEL"; reason: string }

export class Scrollbar extends UIElement {
  private readonly rect: () => Rect
  private readonly axis: Axis
  private readonly viewportSize: () => number
  private readonly contentSize: () => number
  private readonly value: () => number
  private readonly onChange: (next: number) => void
  private readonly minThumb: number
  private readonly active: () => boolean
  private readonly autoHide: boolean

  private hover = false
  private readonly downEvents = createEventStream<PointerUIEvent>()
  private readonly moveEvents = createEventStream<PointerUIEvent>()
  private readonly upEvents = createEventStream<PointerUIEvent>()
  private readonly cancelEvents = createEventStream<string>()
  private readonly machine: Machine<ScrollbarState, ScrollbarEvent, ScrollbarContext>

  constructor(opts: {
    rect: () => Rect
    axis?: Axis
    viewportSize: () => number
    contentSize: () => number
    value: () => number
    onChange: (next: number) => void
    minThumb?: number
    autoHide?: boolean
    active?: () => boolean
  }) {
    super()
    this.rect = opts.rect
    this.axis = opts.axis ?? "y"
    this.viewportSize = opts.viewportSize
    this.contentSize = opts.contentSize
    this.value = opts.value
    this.onChange = opts.onChange
    this.minThumb = Math.max(10, opts.minThumb ?? 20)
    this.autoHide = opts.autoHide ?? true
    this.active = opts.active ?? (() => true)
    this.z = 40
    this.machine = createMachine<ScrollbarState, ScrollbarEvent, ScrollbarContext>({
      initial: "idle",
      context: { originPointer: { x: 0, y: 0 }, lastPointer: { x: 0, y: 0 }, dragOffset: 0 },
      states: {
        idle: {
          on: {
            PRESS: {
              target: "pressed",
              reduce: (_snapshot, event) => ({
                originPointer: event.pointer,
                lastPointer: event.pointer,
                dragOffset: event.dragOffset,
              }),
            },
          },
        },
        pressed: {
          on: {
            DRAG_START: {
              target: "dragging",
              reduce: (_snapshot, event) => ({ lastPointer: event.pointer }),
              effect: (snapshot, event) => {
                this.setByPointer(this.axis === "y" ? event.pointer.y : event.pointer.x, snapshot.context.dragOffset)
              },
            },
            RELEASE: {
              target: "idle",
              reduce: (_snapshot, event) => ({ lastPointer: event.pointer }),
            },
            CANCEL: {
              target: "idle",
            },
          },
        },
        dragging: {
          on: {
            DRAG_MOVE: {
              reduce: (_snapshot, event) => ({ lastPointer: event.pointer }),
              effect: (snapshot, event) => {
                this.setByPointer(this.axis === "y" ? event.pointer.y : event.pointer.x, snapshot.context.dragOffset)
              },
            },
            RELEASE: {
              target: "idle",
              reduce: (_snapshot, event) => ({ lastPointer: event.pointer }),
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

  private metrics(): ThumbMetrics {
    const r = this.rect()
    const viewport = Math.max(0, this.viewportSize())
    const content = Math.max(0, this.contentSize())
    const trackLength = Math.max(0, this.axis === "y" ? r.h : r.w)
    const maxValue = Math.max(0, content - viewport)
    if (trackLength <= 0 || maxValue <= 0 || content <= 0 || viewport <= 0) {
      return { maxValue, trackLength, thumbLength: trackLength, thumbOffset: 0 }
    }
    const thumbLength = clamp((viewport / content) * trackLength, this.minThumb, trackLength)
    const span = Math.max(0, trackLength - thumbLength)
    const value = clamp(this.value(), 0, maxValue)
    const thumbOffset = span <= 0 ? 0 : (value / maxValue) * span
    return { maxValue, trackLength, thumbLength, thumbOffset }
  }

  private hidden() {
    if (!this.active()) return true
    if (!this.autoHide) return false
    return this.metrics().maxValue <= 0
  }

  private thumbRect() {
    const r = this.rect()
    const m = this.metrics()
    if (this.axis === "y") return { x: r.x, y: r.y + m.thumbOffset, w: r.w, h: m.thumbLength }
    return { x: r.x + m.thumbOffset, y: r.y, w: m.thumbLength, h: r.h }
  }

  private setByPointer(pointer: number, dragOffset: number) {
    const r = this.rect()
    const m = this.metrics()
    if (m.maxValue <= 0) return
    const trackPos = this.axis === "y" ? pointer - r.y : pointer - r.x
    const span = Math.max(0, m.trackLength - m.thumbLength)
    const nextThumb = clamp(trackPos - dragOffset, 0, span)
    const next = span <= 0 ? 0 : (nextThumb / span) * m.maxValue
    this.onChange(next)
  }

  private setupGestures() {
    dragSession({
      down: this.downEvents.stream,
      move: this.moveEvents.stream,
      up: this.upEvents.stream,
      cancel: this.cancelEvents.stream,
      point: (event) => ({ x: event.x, y: event.y }),
      thresholdSq: 0,
    }).subscribe((event) => {
      if (event.kind === "start") {
        this.machine.send({ type: "DRAG_START", pointer: { x: event.current.x, y: event.current.y } })
        return
      }
      if (event.kind === "move") {
        this.machine.send({ type: "DRAG_MOVE", pointer: { x: event.current.x, y: event.current.y } })
        return
      }
      if (event.kind === "end") {
        this.machine.send({ type: "RELEASE", pointer: { x: event.up.x, y: event.up.y } })
        return
      }
      this.machine.send({ type: "CANCEL", reason: event.reason })
    })
  }

  bounds(): Rect {
    if (this.hidden()) return { x: 0, y: 0, w: 0, h: 0 }
    return this.rect()
  }

  protected containsPoint(p: Vec2) {
    return pointInRect(p, this.bounds())
  }

  protected onDraw(ctx: CanvasRenderingContext2D) {
    if (this.hidden()) return
    const r = this.rect()
    const t = this.thumbRect()
    const active = this.machine.matches("pressed") || this.machine.matches("dragging")
    const track = active ? "rgba(255,255,255,0.07)" : this.hover ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.04)"
    const thumb = active ? "rgba(233,237,243,0.46)" : this.hover ? "rgba(233,237,243,0.38)" : "rgba(233,237,243,0.30)"
    draw(
      ctx,
      RRect({ x: r.x, y: r.y, w: r.w, h: r.h, r: Math.min(theme.radii.sm, Math.min(r.w, r.h) / 2) }, { fill: { color: track } }),
      RRect(
        { x: t.x + 1, y: t.y + 1, w: Math.max(0, t.w - 2), h: Math.max(0, t.h - 2), r: Math.min(theme.radii.sm, Math.min(t.w, t.h) / 2) },
        { fill: { color: thumb } },
      ),
    )
  }

  onPointerEnter() {
    this.hover = true
  }

  onPointerLeave() {
    this.hover = false
    if (this.machine.matches("pressed")) this.cancelEvents.emit("leave")
  }

  onPointerDown(e: PointerUIEvent) {
    if (this.hidden()) return
    if (e.button !== 0) return
    const thumb = this.thumbRect()
    const p = this.axis === "y" ? e.y : e.x
    let dragOffset = 0
    if (pointInRect({ x: e.x, y: e.y }, thumb)) {
      dragOffset = this.axis === "y" ? e.y - thumb.y : e.x - thumb.x
    } else {
      const thumbLen = this.axis === "y" ? thumb.h : thumb.w
      dragOffset = thumbLen / 2
      this.setByPointer(p, dragOffset)
    }
    this.machine.send({ type: "PRESS", pointer: { x: e.x, y: e.y }, dragOffset })
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
