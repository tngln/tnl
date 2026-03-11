import { UIElement, pointInRect, type Rect, type Vec2 } from "./ui"

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
  private readonly invalidate: () => void

  constructor(opts: { rect: () => Rect; invalidate: () => void; z?: number }) {
    this.invalidate = opts.invalidate
    const h = new TopLayerHost(opts.rect)
    h.z = opts.z ?? 8_000_000
    this.host = h
  }

  isOpen(id: string) {
    return this.entries.has(id)
  }

  hasAny() {
    return this.entries.size > 0
  }

  open(id: string, el: UIElement) {
    const prev = this.entries.get(id)
    if (prev === el) return
    if (prev) (this.host as UIElement).remove(prev)
    this.entries.set(id, el)
    el.z = 1
    ;(this.host as UIElement).add(el)
    this.invalidate()
  }

  close(id: string) {
    const prev = this.entries.get(id)
    if (!prev) return
    ;(this.host as UIElement).remove(prev)
    this.entries.delete(id)
    this.invalidate()
  }

  closeAll() {
    if (this.entries.size === 0) return
    for (const el of this.entries.values()) (this.host as UIElement).remove(el)
    this.entries.clear()
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
    this.closeAll()
  }
}
