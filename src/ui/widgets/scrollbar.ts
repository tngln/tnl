import { theme, neutral } from "@/config/theme"
import { draw, RectOp } from "@/core/draw"
import { createEventStream, dragSession, interactionCancelStream, type InteractionCancelReason } from "@/core/event_stream"
import { createMachine, type Machine } from "@/core/fsm"
import { clamp, ZERO_RECT } from "@/core/rect"
import { PointerUIEvent, UIElement, pointInRect, type Rect, type Vec2 } from "@/ui/base/ui"
import type { WidgetDescriptor } from "@/ui/builder/widget_registry"

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
  private rectValue: Rect = ZERO_RECT
  private axis: Axis = "y"
  private viewportSize: number = 0
  private contentSize: number = 0
  private value: number = 0
  private onChange: (next: number) => void = () => {}
  private minThumb: number = 20
  private autoHide: boolean = true
  private activeValue: boolean = true

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
    this.update(opts)
    this.setBounds(() => this.rectValue, () => !this.hidden())
    this.z = 40
    this.machine = createMachine<ScrollbarState, ScrollbarEvent, ScrollbarContext>({
      initial: "idle",
      context: { originPointer: { x: 0, y: 0 }, lastPointer: { x: 0, y: 0 }, dragOffset: 0 },
      debug: { name: "scrollbar", scope: "ui.widgets" },
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

  update(opts: {
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
    this.rectValue = opts.rect()
    this.axis = opts.axis ?? "y"
    this.viewportSize = opts.viewportSize()
    this.contentSize = opts.contentSize()
    this.value = opts.value()
    this.onChange = opts.onChange
    this.minThumb = Math.max(10, opts.minThumb ?? 20)
    this.autoHide = opts.autoHide ?? true
    this.activeValue = opts.active ? opts.active() : true
  }

  private metrics(): ThumbMetrics {
    const r = this.rectValue
    const viewport = Math.max(0, this.viewportSize)
    const content = Math.max(0, this.contentSize)
    const trackLength = Math.max(0, this.axis === "y" ? r.h : r.w)
    const maxValue = Math.max(0, content - viewport)
    if (trackLength <= 0 || maxValue <= 0 || content <= 0 || viewport <= 0) {
      return { maxValue, trackLength, thumbLength: trackLength, thumbOffset: 0 }
    }
    const thumbLength = clamp((viewport / content) * trackLength, this.minThumb, trackLength)
    const span = Math.max(0, trackLength - thumbLength)
    const value = clamp(this.value, 0, maxValue)
    const thumbOffset = span <= 0 ? 0 : (value / maxValue) * span
    return { maxValue, trackLength, thumbLength, thumbOffset }
  }

  private hidden() {
    if (!this.activeValue) return true
    if (!this.autoHide) return false
    return this.metrics().maxValue <= 0
  }

  private thumbRect() {
    const r = this.rectValue
    const m = this.metrics()
    if (this.axis === "y") return { x: r.x, y: r.y + m.thumbOffset, w: r.w, h: m.thumbLength }
    return { x: r.x + m.thumbOffset, y: r.y, w: m.thumbLength, h: r.h }
  }

  private setByPointer(pointer: number, dragOffset: number) {
    const r = this.rectValue
    const m = this.metrics()
    if (m.maxValue <= 0) return
    const trackPos = this.axis === "y" ? pointer - r.y : pointer - r.x
    const span = Math.max(0, m.trackLength - m.thumbLength)
    const nextThumb = clamp(trackPos - dragOffset, 0, span)
    const next = span <= 0 ? 0 : (nextThumb / span) * m.maxValue
    this.onChange(next)
  }

  private setupGestures() {
    const dragMoves = this.moveEvents.stream.filter((event) => (event.buttons & 1) !== 0)
    const cancel = interactionCancelStream({
      cancel: this.cancelEvents.stream,
      move: this.moveEvents.stream,
      buttons: (event) => event.buttons,
    })

    dragSession({
      down: this.downEvents.stream,
      move: dragMoves,
      up: this.upEvents.stream,
      cancel,
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

  protected onDraw(ctx: CanvasRenderingContext2D) {
    if (this.hidden()) return
    const r = this.rectValue
    const t = this.thumbRect()
    const active = this.machine.matches("pressed") || this.machine.matches("dragging")
    const track = active ? neutral[500] : this.hover ? neutral[600] : neutral[700]
    const thumb = active ? theme.colors.scrollThumbActive : this.hover ? theme.colors.scrollThumbHover : theme.colors.scrollThumb
    draw(
      ctx,
      RectOp({ x: r.x, y: r.y, w: r.w, h: r.h }, { radius: Math.min(theme.radii.sm, Math.min(r.w, r.h) / 2), fill: { paint: track } }),
      RectOp(
        { x: t.x + 1, y: t.y + 1, w: Math.max(0, t.w - 2), h: Math.max(0, t.h - 2) },
        { radius: Math.min(theme.radii.sm, Math.min(t.w, t.h) / 2), fill: { paint: thumb } },
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

  onPointerCancel(_e: PointerUIEvent | null, reason: InteractionCancelReason) {
    this.hover = false
    this.cancelEvents.emit(reason)
  }
}

type ScrollbarStateData = {
  widget: Scrollbar
  rect: Rect
  active: boolean
}

export const scrollbarDescriptor: WidgetDescriptor<ScrollbarStateData, {
  axis?: Axis
  viewportSize: number
  contentSize: number
  value: number
  onChange: (next: number) => void
  minThumb?: number
  autoHide?: boolean
}> = {
  id: "scrollbar",
  initialZIndex: 40,
  create: () => {
    const state = { rect: ZERO_RECT, active: false } as ScrollbarStateData
    state.widget = new Scrollbar({
      rect: () => state.rect,
      viewportSize: () => 0,
      contentSize: () => 0,
      value: () => 0,
      onChange: () => {},
      active: () => state.active,
    })
    return state
  },
  getWidget: (state) => state.widget,
  mount: (state, props, rect, active) => {
    state.rect = rect
    state.active = active
    state.widget.update({
      rect: () => state.rect,
      axis: props.axis,
      viewportSize: () => props.viewportSize,
      contentSize: () => props.contentSize,
      value: () => props.value,
      onChange: props.onChange,
      minThumb: props.minThumb,
      autoHide: props.autoHide,
      active: () => state.active,
    })
  },
}
