import type { RenderGraphSnapshotV1, RenderQuality, RenderReason, RenderTarget } from "./types"

export type RenderWorkerRequest =
  | { type: "setGraph"; graph: RenderGraphSnapshotV1 }
  | { type: "setIntent"; intent: { playing: boolean; rate: number; direction: 1 | -1; targetFrame: number } }
  | {
      type: "render"
      requestId: number
      frame: number
      fps: number
      quality: RenderQuality
      reason: RenderReason
      target: RenderTarget
      budgetMs: number
    }
  | { type: "cancel"; requestId: number }

export type RenderWorkerResponse =
  | {
      type: "rendered"
      requestId: number
      presentedFrame: number
      quality: RenderQuality
      bitmap: ImageBitmap
      startedAt: number
      finishedAt: number
      budgetMs: number
    }
  | { type: "error"; requestId: number; message: string }

