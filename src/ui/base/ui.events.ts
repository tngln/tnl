import type { InteractionCancelReason } from "@/core/event_stream"
import type { Vec2 } from "@/core/rect"

export type PointerLike = {
  pointerId: number
  x: number
  y: number
  button: number
  buttons: number
  altKey: boolean
  ctrlKey: boolean
  shiftKey: boolean
  metaKey: boolean
  timeStamp?: number
}

export type WheelLike = {
  x: number
  y: number
  deltaX: number
  deltaY: number
  deltaZ: number
  altKey: boolean
  ctrlKey: boolean
  shiftKey: boolean
  metaKey: boolean
  timeStamp?: number
}

export type KeyLike = {
  code: string
  key: string
  repeat: boolean
  altKey: boolean
  ctrlKey: boolean
  shiftKey: boolean
  metaKey: boolean
  timeStamp?: number
}

export type KeyDispatchResult = {
  consumed: boolean
  preventDefault: boolean
}

export type PointerDispatchResult = {
  target: UIEventTargetNode | null
  captureTarget: UIEventTargetNode | null
  focusTarget: UIEventTargetNode | null
  handled: boolean
  propagationStopped: boolean
}

export type UIEventPhase = "target" | "bubble"

export interface UIEventTargetNode {
  eventParentTarget(): UIEventTargetNode | null
  canFocus?(): boolean
  onFocus?(): void
  onBlur?(): void
  onPointerDown?(e: PointerUIEvent): void
  onPointerMove?(e: PointerUIEvent): void
  onPointerUp?(e: PointerUIEvent): void
  onDoubleClick?(e: PointerUIEvent): void
  onPointerCancel?(e: PointerUIEvent | null, reason: InteractionCancelReason): void
  onWheel?(e: WheelUIEvent): void
  onKeyDown?(e: KeyUIEvent): void
  onKeyUp?(e: KeyUIEvent): void
}

class UIEventBase {
  readonly timeStamp: number
  target: UIEventTargetNode | null = null
  currentTarget: UIEventTargetNode | null = null
  phase: UIEventPhase = "target"
  protected stopped = false

  constructor(timeStamp?: number) {
    this.timeStamp = timeStamp ?? Date.now()
  }

  stopPropagation() {
    this.stopped = true
  }

  get propagationStopped() {
    return this.stopped
  }

  withDispatch(target: UIEventTargetNode, currentTarget: UIEventTargetNode, phase: UIEventPhase) {
    this.target = target
    this.currentTarget = currentTarget
    this.phase = phase
  }
}

export class PointerUIEvent extends UIEventBase {
  readonly pointerId: number
  readonly x: number
  readonly y: number
  readonly button: number
  readonly buttons: number
  readonly altKey: boolean
  readonly ctrlKey: boolean
  readonly shiftKey: boolean
  readonly metaKey: boolean
  private captured = false
  private handled = false
  private requestedFocusTarget: UIEventTargetNode | null = null
  private pointerCancelReason: InteractionCancelReason | null = null

  constructor(e: PointerLike) {
    super(e.timeStamp)
    this.pointerId = e.pointerId
    this.x = e.x
    this.y = e.y
    this.button = e.button
    this.buttons = e.buttons
    this.altKey = e.altKey
    this.ctrlKey = e.ctrlKey
    this.shiftKey = e.shiftKey
    this.metaKey = e.metaKey
  }

  capture() {
    this.captured = true
  }

  capturePointer() {
    this.capture()
  }

  handle() {
    this.handled = true
  }

  preventDefault() {
    this.handle()
  }

  requestFocus(target?: UIEventTargetNode | null) {
    this.requestedFocusTarget = target ?? this.target
  }

  get didCapture() {
    return this.captured
  }

  get didHandle() {
    return this.handled
  }

  get focusTarget() {
    return this.requestedFocusTarget
  }

  markCancelReason(reason: InteractionCancelReason) {
    this.pointerCancelReason = reason
  }

  get cancelReason() {
    return this.pointerCancelReason
  }

  withDispatch(target: UIEventTargetNode, currentTarget: UIEventTargetNode, phase: UIEventPhase, point?: Vec2) {
    super.withDispatch(target, currentTarget, phase)
    if (point) {
      ;(this as { x: number; y: number }).x = point.x
      ;(this as { y: number }).y = point.y
    }
  }

  adoptOutcome(other: PointerUIEvent) {
    if (other.target) this.target = other.target
    if (other.focusTarget) this.requestedFocusTarget = other.focusTarget
    if (other.didCapture) this.capturePointer()
    if (other.didHandle) this.handle()
    if (other.propagationStopped) this.stopPropagation()
  }
}

export class WheelUIEvent extends UIEventBase {
  readonly x: number
  readonly y: number
  readonly deltaX: number
  readonly deltaY: number
  readonly deltaZ: number
  readonly altKey: boolean
  readonly ctrlKey: boolean
  readonly shiftKey: boolean
  readonly metaKey: boolean
  private handled = false

  constructor(e: WheelLike) {
    super(e.timeStamp)
    this.x = e.x
    this.y = e.y
    this.deltaX = e.deltaX
    this.deltaY = e.deltaY
    this.deltaZ = e.deltaZ
    this.altKey = e.altKey
    this.ctrlKey = e.ctrlKey
    this.shiftKey = e.shiftKey
    this.metaKey = e.metaKey
  }

  handle() {
    this.handled = true
  }

  preventDefault() {
    this.handle()
  }

  get didHandle() {
    return this.handled
  }

  withDispatch(target: UIEventTargetNode, currentTarget: UIEventTargetNode, phase: UIEventPhase, point?: Vec2) {
    super.withDispatch(target, currentTarget, phase)
    if (point) {
      ;(this as { x: number; y: number }).x = point.x
      ;(this as { y: number }).y = point.y
    }
  }

  adoptOutcome(other: WheelUIEvent) {
    if (other.target) this.target = other.target
    if (other.didHandle) this.handle()
    if (other.propagationStopped) this.stopPropagation()
  }
}

export class KeyUIEvent extends UIEventBase {
  readonly code: string
  readonly key: string
  readonly repeat: boolean
  readonly altKey: boolean
  readonly ctrlKey: boolean
  readonly shiftKey: boolean
  readonly metaKey: boolean
  private consumed = false
  private prevented = false

  constructor(e: KeyLike) {
    super(e.timeStamp)
    this.code = e.code
    this.key = e.key
    this.repeat = e.repeat
    this.altKey = e.altKey
    this.ctrlKey = e.ctrlKey
    this.shiftKey = e.shiftKey
    this.metaKey = e.metaKey
  }

  handle() {
    this.consume()
  }

  consume() {
    this.consumed = true
  }

  preventDefault() {
    this.consume()
    this.prevented = true
  }

  get didHandle() {
    return this.consumed
  }

  get didConsume() {
    return this.consumed
  }

  get didPreventDefault() {
    return this.prevented
  }

  adoptOutcome(other: KeyUIEvent) {
    if (other.target) this.target = other.target
    if (other.didConsume) this.consume()
    if (other.didPreventDefault) this.preventDefault()
    if (other.propagationStopped) this.stopPropagation()
  }
}
