import type { InteractionCancelReason } from "./event_stream"
import type { Rect, Vec2 } from "./ui_base"

// Drag payload registry. Extend via module augmentation:
// declare module "../base/drag_drop" { interface DragPayloadByKind { "dock.pane": MyPayload } }
export interface DragPayloadByKind {}

export { DragImageOverlay } from "./drag_drop.overlay"

export type DragKind = keyof DragPayloadByKind & string
export type DragPayload<K extends DragKind> = DragPayloadByKind[K]

export type DropEffect = "none" | "move" | "copy" | "link"

export type DropPreview = {
  rect: Rect
  style?: "dock" | "insert" | (string & {})
  // Provider-specific metadata for consumers (e.g. DockDropPreview).
  data?: unknown
}

export type DragImageSpec = {
  source: CanvasImageSource
  sizeCss: Vec2
  // Defaults to centered on the pointer.
  offsetCss?: Vec2
  opacity?: number
}

export type DropCandidate = {
  targetId: string
  effect: DropEffect
  preview?: DropPreview
  commit(): void
}

export type ActiveDragSession<K extends DragKind = DragKind> = {
  kind: K
  payload: DragPayload<K>
  pointerId: number
  start: Vec2
  current: Vec2
  buttons: number
  candidate: DropCandidate | null
  dragImage: DragImageSpec | null
}

export type DragBehavior<K extends DragKind = DragKind> = {
  onMove?(pGlobal: Vec2): void
  onTargetChanged?(prev: DropCandidate | null, next: DropCandidate | null): void
  onDropAccepted?(targetId: string): void
  onCancel?(reason: InteractionCancelReason | (string & {})): void
}

export type DropProvider = {
  id: string
  orderKey(): number
  resolve(session: ActiveDragSession, pGlobal: Vec2): DropCandidate | null
}

export class DragDropController {
  private providers: DropProvider[] = []
  private providersDirty = false
  private active: ActiveDragSession | null = null
  private behavior: DragBehavior | null = null

  registerProvider(provider: DropProvider) {
    this.providers.push(provider)
    this.providersDirty = true
    return () => this.unregisterProvider(provider.id)
  }

  unregisterProvider(id: string) {
    const before = this.providers.length
    this.providers = this.providers.filter((p) => p.id !== id)
    if (this.providers.length !== before) this.providersDirty = true
  }

  getActive() {
    return this.active
  }

  begin<K extends DragKind>(args: { kind: K; payload: DragPayload<K>; pointerId: number; start: Vec2; behavior?: DragBehavior<K>; dragImage?: DragImageSpec | null }) {
    if (this.active) this.cancel("inactive")
    const image = args.dragImage ?? null
    const session: ActiveDragSession<K> = {
      kind: args.kind,
      payload: args.payload,
      pointerId: args.pointerId,
      start: args.start,
      current: args.start,
      buttons: 1,
      candidate: null,
      dragImage: image ? this.normalizeDragImage(image) : null,
    }
    this.active = session
    this.behavior = (args.behavior ?? null) as DragBehavior | null
    // Prime candidate on begin so preview is available immediately.
    this.resolveCandidate(args.start)
  }

  setDragImage(image: DragImageSpec | null) {
    const session = this.active
    if (!session) return
    session.dragImage = image ? this.normalizeDragImage(image) : null
  }

  move(pointerId: number, p: Vec2, buttons: number) {
    const session = this.active
    if (!session || session.pointerId !== pointerId) return
    session.current = p
    session.buttons = buttons
    if ((buttons & 1) === 0) {
      this.cancel("buttons-released")
      return
    }
    this.behavior?.onMove?.(p)
    this.resolveCandidate(p)
  }

  end(pointerId: number, p: Vec2) {
    const session = this.active
    if (!session || session.pointerId !== pointerId) return
    session.current = p
    this.behavior?.onMove?.(p)
    this.resolveCandidate(p)

    const candidate = session.candidate
    if (candidate) {
      candidate.commit()
      this.behavior?.onDropAccepted?.(candidate.targetId)
    }
    this.active = null
    this.behavior = null
  }

  cancel(reason: InteractionCancelReason | (string & {})) {
    if (!this.active) return
    this.active = null
    const behavior = this.behavior
    this.behavior = null
    behavior?.onCancel?.(reason)
  }

  private sortedProviders() {
    if (!this.providersDirty) return this.providers
    this.providersDirty = false
    this.providers.sort((a, b) => b.orderKey() - a.orderKey())
    return this.providers
  }

  private resolveCandidate(p: Vec2) {
    const session = this.active
    if (!session) return
    const prev = session.candidate
    let next: DropCandidate | null = null
    for (const provider of this.sortedProviders()) {
      const candidate = provider.resolve(session, p)
      if (candidate) {
        next = candidate
        break
      }
    }
    session.candidate = next
    if ((prev?.targetId ?? null) !== (next?.targetId ?? null)) {
      this.behavior?.onTargetChanged?.(prev, next)
    }
  }

  private normalizeDragImage(image: DragImageSpec): DragImageSpec {
    const size = image.sizeCss
    const offset = image.offsetCss ?? { x: -size.x / 2, y: -size.y / 2 }
    return {
      source: image.source,
      sizeCss: size,
      offsetCss: offset,
      opacity: image.opacity ?? 0.9,
    }
  }
}
