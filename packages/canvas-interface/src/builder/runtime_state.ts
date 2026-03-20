import type { Rect } from "../draw"

export class NodeRuntimeStateStore {
  private readonly values = new Map<string, unknown>()

  read<T>(key: string): T | undefined {
    return this.values.get(key) as T | undefined
  }

  write<T>(key: string, value: T) {
    this.values.set(key, value)
  }

  delete(key: string) {
    this.values.delete(key)
  }
}

export type RuntimeStateBinding = {
  key: string
  store: NodeRuntimeStateStore
}

export type RuntimeRegionSnapshot = {
  primaryRect: Rect
  contentRect?: Rect
  overlayRect?: Rect
  anchorRect?: Rect
  hitRegions?: Record<string, Rect>
  focusRegion?: Rect
}

export type VisualStateSnapshot = RuntimeRegionSnapshot & {
  active: boolean
  disabled?: boolean
  focused?: boolean
  hover?: boolean
  pressed?: boolean
  open?: boolean
  selectionStart?: number
  selectionEnd?: number
  scrollX?: number
}

export function writeRuntimeState(binding: RuntimeStateBinding | undefined, snapshot: VisualStateSnapshot) {
  if (!binding) return
  binding.store.write(binding.key, snapshot)
}

export function writeRuntimeRegions(binding: RuntimeStateBinding | undefined, regions: RuntimeRegionSnapshot, patch: Omit<VisualStateSnapshot, keyof RuntimeRegionSnapshot>) {
  if (!binding) return
  binding.store.write(binding.key, {
    ...regions,
    ...patch,
  } satisfies VisualStateSnapshot)
}
