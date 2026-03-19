import { UIElement, pointInRect, type Rect, type Vec2 } from "./ui_base"

type EntryOptions = {
  onDismiss?: () => void
}

class TopLayerHost extends UIElement {
  constructor(private readonly rect: () => Rect) {
    super()
  }

  bounds(): Rect {
    return this.rect()
  }

  hitTest(p: Vec2, ctx?: CanvasRenderingContext2D) {
    if (!this.visible) return null
    if (!pointInRect(p, this.bounds())) return null
    for (let i = this.children.length - 1; i >= 0; i--) {
      const hit = this.children[i].hitTest(p, ctx)
      if (hit) return hit
    }
    return null
  }
}

export class TopLayerController {
  readonly host: UIElement
  private readonly entries = new Map<string, UIElement>()
  private readonly entryOptions = new Map<string, EntryOptions>()
  private invalidate: () => void

  constructor(opts: { rect: () => Rect; invalidate: () => void; z?: number }) {
    this.invalidate = opts.invalidate
    const h = new TopLayerHost(opts.rect)
    h.z = opts.z ?? 8_000_000
    this.host = h
  }

  setInvalidator(invalidate: (() => void) | null) {
    this.invalidate = invalidate ?? (() => {})
  }

  isOpen(id: string) {
    return this.entries.has(id)
  }

  hasAny() {
    return this.entries.size > 0
  }

  open(id: string, el: UIElement, opts?: EntryOptions) {
    const prev = this.entries.get(id)
    if (prev === el && !opts) return
    if (prev) (this.host as UIElement).remove(prev)
    this.entries.set(id, el)
    if (opts) this.entryOptions.set(id, opts)
    else this.entryOptions.delete(id)
    el.z = 1
    ;(this.host as UIElement).add(el)
    this.invalidate()
  }

  close(id: string) {
    const prev = this.entries.get(id)
    if (!prev) return
    ;(this.host as UIElement).remove(prev)
    this.entries.delete(id)
    this.entryOptions.delete(id)
    this.invalidate()
  }

  closeAll() {
    if (this.entries.size === 0) return
    for (const el of this.entries.values()) (this.host as UIElement).remove(el)
    this.entries.clear()
    this.entryOptions.clear()
    this.invalidate()
  }

  containsPoint(p: Vec2, ctx?: CanvasRenderingContext2D) {
    for (const el of this.entries.values()) {
      if (el.hitTest(p, ctx)) return true
    }
    return false
  }

  lightDismiss(p: Vec2, ctx?: CanvasRenderingContext2D) {
    if (this.entries.size === 0) return
    if (this.containsPoint(p, ctx)) return
    const callbacks: (() => void)[] = []
    for (const opts of this.entryOptions.values()) {
      if (opts.onDismiss) callbacks.push(opts.onDismiss)
    }
    if (callbacks.length > 0) {
      for (const cb of callbacks) cb()
    } else {
      this.closeAll()
    }
  }
}

/**
 * Registers an element as a click-outside-dismissable overlay.
 * When a pointer down lands outside the element, `onDismiss` is called.
 * Returns a cleanup function that removes the overlay.
 */
export function useClickOutsideHandler(opts: {
  id: string
  element: UIElement
  topLayer: TopLayerController
  onDismiss: () => void
}): () => void {
  opts.topLayer.open(opts.id, opts.element, { onDismiss: opts.onDismiss })
  return () => opts.topLayer.close(opts.id)
}
