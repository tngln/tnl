import type { RenderQuality } from "./types"

export type FrameKey = `${number}:${RenderQuality}`

export type FrameEntry<TFrame> = {
  frame: number
  quality: RenderQuality
  bitmap: TFrame
  createdAt: number
  close?: () => void
}

export type FrameRingBufferStats = {
  capacity: number
  size: number
  hits: number
  misses: number
  evictions: number
}

export class FrameRingBuffer<TFrame> {
  private readonly capacity: number
  private readonly byKey = new Map<FrameKey, FrameEntry<TFrame>>()
  private readonly lru: FrameKey[] = []
  private hits = 0
  private misses = 0
  private evictions = 0

  constructor(opts: { capacity: number }) {
    this.capacity = Math.max(1, Math.floor(opts.capacity))
  }

  snapshotStats(): FrameRingBufferStats {
    return {
      capacity: this.capacity,
      size: this.byKey.size,
      hits: this.hits,
      misses: this.misses,
      evictions: this.evictions,
    }
  }

  clear() {
    for (const entry of this.byKey.values()) entry.close?.()
    this.byKey.clear()
    this.lru.length = 0
  }

  private key(frame: number, quality: RenderQuality): FrameKey {
    return `${frame}:${quality}`
  }

  get(frame: number, quality: RenderQuality) {
    const key = this.key(frame, quality)
    const hit = this.byKey.get(key) ?? null
    if (!hit) {
      this.misses += 1
      return null
    }
    this.hits += 1
    this.touch(key)
    return hit
  }

  put(entry: Omit<FrameEntry<TFrame>, "createdAt"> & { createdAt?: number }) {
    const createdAt = entry.createdAt ?? Date.now()
    const key = this.key(entry.frame, entry.quality)
    const existing = this.byKey.get(key)
    if (existing) {
      existing.close?.()
      this.removeFromLru(key)
    }
    this.byKey.set(key, { ...entry, createdAt })
    this.lru.unshift(key)
    this.evictIfNeeded()
  }

  private touch(key: FrameKey) {
    this.removeFromLru(key)
    this.lru.unshift(key)
  }

  private removeFromLru(key: FrameKey) {
    const idx = this.lru.indexOf(key)
    if (idx >= 0) this.lru.splice(idx, 1)
  }

  private evictIfNeeded() {
    while (this.byKey.size > this.capacity) {
      const key = this.lru.pop()
      if (!key) return
      const entry = this.byKey.get(key)
      if (entry) {
        this.evictions += 1
        entry.close?.()
        this.byKey.delete(key)
      }
    }
  }
}

