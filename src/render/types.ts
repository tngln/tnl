export type FrameTime = {
  frame: number
  fps: number
}

export type RenderQuality = "full" | "proxy"
export type RenderQualityMode = RenderQuality | "auto"
export type RenderReason = "playback" | "scrub" | "thumbnail" | "export"

export type RenderTarget = {
  w: number
  h: number
}

export type RenderPlaybackIntent = {
  playing: boolean
  rate: number
  direction: 1 | -1
  targetFrame: number
}

export type RenderGraphSnapshotV1 = {
  version: 1
  fps: number
  // v1: keep it minimal and forward-compatible. Real tracks/clips/effects come later.
  tracks?: unknown
}

export type RenderRequestOptions = {
  quality: RenderQualityMode
  reason: RenderReason
  target: RenderTarget
  budgetMs?: number
  signal?: AbortSignal
}

export type RenderStats = {
  requestId: number
  queuedAt: number
  startedAt: number
  finishedAt: number
  budgetMs: number
  late: boolean
  backend: "fake-worker"
}

export type RenderResult<TFrame> = {
  bitmap: TFrame
  presentedFrame: number
  sourceQuality: RenderQuality
  stats: RenderStats
}

