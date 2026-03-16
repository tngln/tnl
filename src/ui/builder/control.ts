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

import type { InteractionCancelReason } from "@/core/event_stream"
import { createPressMachine } from "@/core/fsm"
import type { Rect } from "@/core/rect"
import type { CursorKind } from "@/platform/web"
import { PointerUIEvent, UIElement } from "@/ui/base/ui"

export type ControlState = {
  hover: boolean
  pressed: boolean
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
  cursor?: CursorKind
}

/**
 * Generic interactive element used by all simple controls (button, checkbox,
 * radio, list row, click area, etc.). Created once per stable key and reused
 * across frames; only `update()` is called each frame with fresh options.
 */
export class ControlElement extends UIElement {
  private readonly press = createPressMachine()
  private _drawFn: ControlDrawFn = () => {}
  private _onClick: (() => void) | undefined
  private _onDoubleClick: (() => void) | undefined
  private _cursor: CursorKind | null = null
  private _active = false
  private _disabled = false
  private _rect: Rect = { x: 0, y: 0, w: 0, h: 0 }

  constructor() {
    super()
    this._setupHandlers()
  }

  private _setupHandlers() {
    this.on("pointerleave", () => {
      if (this.press.matches("pressed")) this.press.send({ type: "CANCEL", reason: "leave" })
    })
    this.on("pointerdown", (e: PointerUIEvent) => {
      if (this._disabled) return
      if (e.button !== 0) return
      this.press.send({ type: "PRESS", point: { x: e.x, y: e.y } })
      e.capture()
    })
    this.on("pointerup", (e: PointerUIEvent) => {
      if (this._disabled) {
        this.press.send({ type: "CANCEL", reason: "inactive" })
        return
      }
      if (!this.press.matches("pressed")) return
      this.press.send({ type: "RELEASE", point: { x: e.x, y: e.y } })
      if (!this.hover) return
      this._onClick?.()
    })
    this.on("doubleclick", (e: PointerUIEvent) => {
      if (!this.hover) return
      if (e.button !== 0) return
      this._onDoubleClick?.()
    })
    this.on("pointercancel", (payload: { event: PointerUIEvent | null; reason: InteractionCancelReason }) => {
      if (!this.press.matches("pressed")) return
      this.press.send({ type: "CANCEL", reason: payload.reason })
    })
  }

  update(opts: ControlUpdateOpts) {
    this._rect = opts.rect
    this._active = opts.active
    this._disabled = opts.disabled
    this._drawFn = opts.draw
    this._onClick = opts.onClick
    this._onDoubleClick = opts.onDoubleClick
    this._cursor = opts.cursor ?? null
    this.setBounds(this._rect, () => this._active)
    if (!opts.active && this.press.matches("pressed")) {
      this.press.send({ type: "CANCEL", reason: "inactive" })
    }
  }

  protected onDraw(ctx: CanvasRenderingContext2D) {
    if (!this._active) return
    this._drawFn(ctx, this._rect, {
      hover: this.hover,
      pressed: this.press.matches("pressed"),
      disabled: this._disabled,
    })
  }

  cursorAt(p: import("@/core/rect").Vec2, _ctx?: CanvasRenderingContext2D): CursorKind | null {
    if (!this._active) return null
    if (!this.containsPoint(p)) return null
    return this._cursor ?? null
  }

  protected containsPoint(p: import("@/core/rect").Vec2) {
    const r = this._rect
    return p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h
  }
}
