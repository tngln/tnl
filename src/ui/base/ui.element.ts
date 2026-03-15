import type { InteractionCancelReason } from "@/core/event_stream"
import { intersects, ZERO_RECT } from "@/core/rect"
import type { Rect, Vec2 } from "@/core/rect"
import type { CursorKind } from "@/platform/web"
import { Compositor } from "./compositor"
import { KeyUIEvent, PointerUIEvent, type UIElementEventMap, type UIEventTargetNode, WheelUIEvent } from "./ui.events"
import { pointInRect } from "./ui.hit_test"

export type DebugTreeNodeSnapshot = {
  kind: "element" | "surface"
  type: string
  label: string
  id?: string
  bounds?: Rect
  z?: number
  visible?: boolean
  meta?: string
  listeners?: DebugEventListenerSnapshot[]
  children: DebugTreeNodeSnapshot[]
}

export type DebugEventListenerSnapshot = {
  id: string
  label: string
  detail?: string
}

type DrawRuntime = {
  clip?: Rect
  compositor?: Compositor
  frameId: number
  dpr: number
  invalidateRect?: (rect: Rect, opts?: { pad?: number; force?: boolean }) => void
}

export abstract class UIElement {
  parent: UIElement | null = null
  children: UIElement[] = []
  visible = true
  z = 0
  hover = false
  private rt: DrawRuntime | null = null
  private handlers: Map<string, Set<Function>> | null = null

  protected boundsSpec: Rect | (() => Rect) | null = null
  protected boundsWhen: (() => boolean) | null = null

  protected setBounds(spec: Rect | (() => Rect), when?: () => boolean) {
    this.boundsSpec = spec
    this.boundsWhen = when ?? null
  }

  protected clearBounds() {
    this.boundsSpec = null
    this.boundsWhen = null
  }

  bounds(): Rect {
    if (!this.boundsSpec) return ZERO_RECT
    if (this.boundsWhen && !this.boundsWhen()) return ZERO_RECT
    return typeof this.boundsSpec === "function" ? this.boundsSpec() : this.boundsSpec
  }

  protected containsPoint(p: Vec2, _ctx?: CanvasRenderingContext2D) {
    return pointInRect(p, this.bounds())
  }

  add(child: UIElement) {
    child.parent = this
    this.children.push(child)
    this.children.sort((a, b) => a.z - b.z)
  }

  remove(child: UIElement) {
    const idx = this.children.indexOf(child)
    if (idx >= 0) this.children.splice(idx, 1)
    child.parent = null
  }

  eventParentTarget(): UIEventTargetNode | null {
    return this.parent
  }

  hitTest(p: Vec2, ctx?: CanvasRenderingContext2D): UIElement | null {
    if (!this.visible) return null
    if (!this.containsPoint(p, ctx)) return null
    for (let i = this.children.length - 1; i >= 0; i--) {
      const hit = this.children[i].hitTest(p, ctx)
      if (hit) return hit
    }
    return this
  }

  cursorAt(p: Vec2, ctx?: CanvasRenderingContext2D): CursorKind | null {
    if (!this.visible) return null
    if (!this.containsPoint(p, ctx)) return null
    for (let i = this.children.length - 1; i >= 0; i--) {
      const cursor = this.children[i].cursorAt(p, ctx)
      if (cursor) return cursor
    }
    return null
  }

  bringToFront() {
    if (!this.parent) return
    const siblings = this.parent.children
    const maxZ = siblings.reduce((m, c) => Math.max(m, c.z), 0)
    this.z = maxZ + 1
    siblings.sort((a, b) => a.z - b.z)
  }

  protected renderRuntime() {
    return this.rt
  }

  protected debugDescribe(): Omit<DebugTreeNodeSnapshot, "children"> | null {
    return {
      kind: "element",
      type: this.constructor.name || "UIElement",
      label: this.constructor.name || "UIElement",
      bounds: this.bounds(),
      z: this.z,
      visible: this.visible,
    }
  }

  protected debugChildren(): DebugTreeNodeSnapshot[] {
    return this.children.map((child) => child.debugSnapshot())
  }

  protected debugListeners(): DebugEventListenerSnapshot[] | null {
    return null
  }

  private inferDebugListeners(): DebugEventListenerSnapshot[] | null {
    if (!this.handlers) return null
    const out: DebugEventListenerSnapshot[] = []
    const add = (id: string, label: string) => out.push({ id, label })
    if (this.handlers.has("pointerdown")) add("pointer.down", "Pointer Down")
    if (this.handlers.has("pointermove")) add("pointer.move", "Pointer Move")
    if (this.handlers.has("pointerup")) add("pointer.up", "Pointer Up")
    if (this.handlers.has("pointercancel")) add("pointer.cancel", "Pointer Cancel")
    if (this.handlers.has("pointerenter")) add("pointer.enter", "Pointer Enter")
    if (this.handlers.has("pointerleave")) add("pointer.leave", "Pointer Leave")
    if (this.handlers.has("wheel")) add("wheel", "Wheel")
    if (this.handlers.has("keydown")) add("key.down", "Key Down")
    if (this.handlers.has("keyup")) add("key.up", "Key Up")
    if (this.handlers.has("focus") || this.canFocus()) add("focus", "Focus")
    return out.length ? out : null
  }

  debugSnapshot(): DebugTreeNodeSnapshot {
    const described = this.debugDescribe()
    const listeners = this.debugListeners() ?? this.inferDebugListeners()
    if (!described) {
      return {
        kind: "element",
        type: this.constructor.name || "UIElement",
        label: this.constructor.name || "UIElement",
        listeners: listeners ?? undefined,
        children: this.debugChildren(),
      }
    }
    return {
      ...described,
      listeners: listeners ?? undefined,
      children: this.debugChildren(),
    }
  }

  draw(ctx: CanvasRenderingContext2D, rt?: DrawRuntime) {
    if (!this.visible) return
    this.rt = rt ?? null
    const clip = rt?.clip
    if (clip) {
      const b = this.bounds()
      if (!intersects(b, clip)) return
    }
    this.onDraw(ctx)
    for (const child of this.children) child.draw(ctx, rt)
  }

  protected onDraw(_ctx: CanvasRenderingContext2D) {}

  captureCursor(): CursorKind | null {
    for (let i = this.children.length - 1; i >= 0; i--) {
      const child = this.children[i]
      if (!(child instanceof CursorRegion)) continue
      const bounds = child.bounds()
      const cursor = child.cursorAt({ x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h / 2 })
      if (cursor) return cursor
    }
    return null
  }

  on<K extends keyof UIElementEventMap>(
    type: K,
    handler: UIElementEventMap[K] extends void ? () => void : (event: UIElementEventMap[K]) => void,
  ): () => void {
    if (!this.handlers) this.handlers = new Map()
    let set = this.handlers.get(type)
    if (!set) {
      set = new Set()
      this.handlers.set(type, set)
    }
    set.add(handler)
    return () => {
      set!.delete(handler)
      if (set!.size === 0) this.handlers?.delete(type)
    }
  }

  off<K extends keyof UIElementEventMap>(
    type: K,
    handler: UIElementEventMap[K] extends void ? () => void : (event: UIElementEventMap[K]) => void,
  ) {
    const set = this.handlers?.get(type)
    if (!set) return
    set.delete(handler)
    if (set.size === 0) this.handlers?.delete(type)
  }

  emit<K extends keyof UIElementEventMap>(type: K, ...args: UIElementEventMap[K] extends void ? [] : [UIElementEventMap[K]]): void {
    if (type === "pointerenter") this.hover = true
    else if (type === "pointerleave" || type === "pointercancel") this.hover = false
    const set = this.handlers?.get(type)
    if (!set) return
    const event = args[0]
    for (const handler of set) {
      if (event !== undefined) (handler as (e: any) => void)(event)
      else (handler as () => void)()
    }
  }

  canFocus() {
    return false
  }
  onRuntimeActivate() {}
  onRuntimeDeactivate() {}

  protected invalidateSelf(opts?: { pad?: number; force?: boolean }) {
    this.rt?.invalidateRect?.(this.bounds(), opts)
  }
}

export class CursorRegion extends UIElement {
  private readonly rect: () => Rect
  private readonly cursor: () => CursorKind
  private readonly active: () => boolean

  constructor(opts: { rect: () => Rect; cursor: CursorKind | (() => CursorKind); active?: () => boolean }) {
    super()
    this.rect = opts.rect
    const cursor = opts.cursor
    this.cursor = typeof cursor === "function" ? () => cursor() : () => cursor
    this.active = opts.active ?? (() => true)
    this.setBounds(this.rect, this.active)
  }

  hitTest(_p: Vec2, _ctx?: CanvasRenderingContext2D): UIElement | null {
    return null
  }

  cursorAt(p: Vec2, _ctx?: CanvasRenderingContext2D): CursorKind | null {
    if (!this.active() || !pointInRect(p, this.rect())) return null
    return this.cursor()
  }
}
