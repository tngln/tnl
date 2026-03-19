/**
 * Phase 2: ControlElement — a thin, reusable interactive region for simple controls.
 *
 * Replaces dedicated retained UIElement subclasses (Button, Checkbox, Radio, ListRow, etc.)
 * with a generic element whose draw function is supplied fresh each frame by the
 * builder handler. Interaction state (hover, pressed) is tracked here and passed
 * into the draw function instead of living in class instance variables.
 *
 * This breaks the chain:
 *   BuilderNode → widget descriptor → Button/Checkbox/.../UIElement
 * and replaces it with:
 *   BuilderNode → ControlElement (generic pool) + pure draw function
 */

import type { InteractionCancelReason } from "../event_stream"
import type { Rect } from "../draw"
import type { CursorKind, DebugRuntimeStateSnapshot, RuntimeDeactivateReason, Vec2 } from "../ui_base"
import { PointerUIEvent, UIElement } from "../ui_base"
import { usePress, type PressBinding } from "../use/use_press"

export type ControlState = {
  hover: boolean
  pressed: boolean
  dragging: boolean
  disabled: boolean
}

export type ControlDrawFn = (ctx: CanvasRenderingContext2D, rect: Rect, state: ControlState) => void

export type ControlUpdateOpts = {
  rect: Rect
  active: boolean
  disabled: boolean
  draw: ControlDrawFn
  onClick?: () => void
  onDoubleClick?: () => void
  onPointerDown?: (e: PointerUIEvent) => void
  onPointerMove?: (e: PointerUIEvent) => void
  onPointerUp?: (e: PointerUIEvent) => void
  onPointerCancel?: (reason: InteractionCancelReason) => void
  cursor?: CursorKind
}

/**
 * Generic interactive element used by all simple controls (button, checkbox,
 * radio, list row, click area, etc.). Created once per stable key and reused
 * across frames; only `update()` is called each frame with fresh options.
 */
export class ControlElement extends UIElement {
  private readonly press: PressBinding
  private _drawFn: ControlDrawFn = () => {}
  private _onClick: (() => void) | undefined
  private _onDoubleClick: (() => void) | undefined
  private _onPointerDown: ((e: PointerUIEvent) => void) | undefined
  private _onPointerMove: ((e: PointerUIEvent) => void) | undefined
  private _onPointerUp: ((e: PointerUIEvent) => void) | undefined
  private _onPointerCancel: ((reason: InteractionCancelReason) => void) | undefined
  private _cursor: CursorKind | null = null
  private _active = false
  private _disabled = false
  private _dragging = false
  private _rect: Rect = { x: 0, y: 0, w: 0, h: 0 }

  constructor() {
    super()
    this.setBounds(() => this._rect, () => this._active)
    this.press = usePress(this, {
      enabled: () => this._active && !this._disabled,
      onActivate: () => this._onClick?.(),
      onStateChange: () => {
        this.invalidateSelf({ source: "control.press" })
      },
    })
    this.on("doubleclick", (e: PointerUIEvent) => {
      if (!this.hover) return
      if (e.button !== 0) return
      this._onDoubleClick?.()
    })
    this.on("pointerdown", (e: PointerUIEvent) => {
      if (!this._active || this._disabled) return
      if (!this._onPointerDown) return
      if (e.button !== 0) return
      this._dragging = true
      this._onPointerDown(e)
      this.invalidateSelf({ source: "control.pointerDown" })
    })
    this.on("pointermove", (e: PointerUIEvent) => {
      if (!this._dragging) return
      this._onPointerMove?.(e)
    })
    this.on("pointerup", (e: PointerUIEvent) => {
      if (!this._dragging) return
      this._dragging = false
      this._onPointerUp?.(e)
      this.invalidateSelf({ source: "control.pointerUp" })
    })
    this.on("pointercancel", (payload: { event: PointerUIEvent | null; reason: InteractionCancelReason }) => {
      if (!this._dragging) return
      this._dragging = false
      this._onPointerCancel?.(payload.reason)
      this.invalidateSelf({ source: "control.pointerCancel" })
    })
  }

  update(opts: ControlUpdateOpts) {
    const wasActive = this._active
    this._rect = opts.rect
    this._active = opts.active
    this._disabled = opts.disabled
    this._drawFn = opts.draw
    this._onClick = opts.onClick
    this._onDoubleClick = opts.onDoubleClick
    this._onPointerDown = opts.onPointerDown
    this._onPointerMove = opts.onPointerMove
    this._onPointerUp = opts.onPointerUp
    this._onPointerCancel = opts.onPointerCancel
    this._cursor = opts.cursor ?? null
    if (!opts.active && wasActive) this.onRuntimeDeactivate("inactive")
  }

  onRuntimeDeactivate(reason: RuntimeDeactivateReason = "inactive") {
    this.press.cancel(reason)
    if (this._dragging) {
      this._dragging = false
      this._onPointerCancel?.(reason)
      this.invalidateSelf({ source: "control.inactive" })
    }
  }

  protected invalidationOutset() {
    return 2
  }

  protected debugRuntimeState(): DebugRuntimeStateSnapshot | null {
    return {
      title: "Control Runtime",
      fields: [
        { label: "active", value: String(this._active) },
        { label: "disabled", value: String(this._disabled) },
        { label: "hover", value: String(this.hover) },
        { label: "pressed", value: String(this.press.pressed()) },
        { label: "dragging", value: String(this._dragging) },
      ],
    }
  }

  protected onDraw(ctx: CanvasRenderingContext2D) {
    if (!this._active) return
    this._drawFn(ctx, this._rect, {
      hover: this.hover,
      pressed: this.press.pressed(),
      dragging: this._dragging,
      disabled: this._disabled,
    })
  }

  cursorAt(p: Vec2, _ctx?: CanvasRenderingContext2D): CursorKind | null {
    if (!this._active) return null
    if (!this.containsPoint(p)) return null
    return this._cursor ?? null
  }

  protected containsPoint(p: Vec2) {
    const r = this._rect
    return p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h
  }
}
