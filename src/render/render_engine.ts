import { AutoQualityController } from "./auto_quality"
import { quantizeFrame } from "./frame_time"
import type { FrameTime, RenderGraphSnapshotV1, RenderPlaybackIntent, RenderRequestOptions, RenderResult, RenderQuality } from "./types"
import type { RenderWorkerRequest, RenderWorkerResponse } from "./worker_protocol"

type Pending = {
  resolve: (r: RenderResult<ImageBitmap>) => void
  reject: (e: unknown) => void
  startedAt: number
  budgetMs: number
  quality: RenderQuality
}

export class RenderEngine {
  private readonly worker: Worker
  private readonly pending = new Map<number, Pending>()
  private nextRequestId = 1
  private readonly autoQuality = new AutoQualityController()

  constructor(opts?: { worker?: Worker }) {
    this.worker =
      opts?.worker ??
      new Worker(new URL("./render_worker.ts", import.meta.url), {
        type: "module",
        name: "tnl-render-worker",
      })
    this.worker.addEventListener("message", (e: MessageEvent<RenderWorkerResponse>) => this.onWorkerMessage(e.data))
  }

  dispose() {
    for (const [, p] of this.pending) p.reject(new Error("RenderEngine disposed"))
    this.pending.clear()
    this.worker.terminate()
  }

  setGraph(graph: RenderGraphSnapshotV1) {
    this.post({ type: "setGraph", graph })
  }

  setPlaybackIntent(intent: RenderPlaybackIntent) {
    this.post({ type: "setIntent", intent })
  }

  async request(time: FrameTime, opts: RenderRequestOptions): Promise<RenderResult<ImageBitmap>> {
    const budgetMs = Math.max(1, Math.floor(opts.budgetMs ?? (opts.reason === "playback" ? 33 : 100)))
    const fps = Math.max(1, Math.round(time.fps))
    const frame = quantizeFrame(time.frame)

    let quality: RenderQuality
    if (opts.quality === "auto") quality = this.autoQuality.snapshot().mode
    else quality = opts.quality

    if (opts.signal?.aborted) throw new DOMException("Aborted", "AbortError")

    const requestId = this.nextRequestId++
    const startedAt = performance.now()

    const promise = new Promise<RenderResult<ImageBitmap>>((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject, startedAt, budgetMs, quality })
    })

    const onAbort = () => {
      this.cancel(requestId)
    }
    opts.signal?.addEventListener("abort", onAbort, { once: true })

    this.post({
      type: "render",
      requestId,
      frame,
      fps,
      quality,
      reason: opts.reason,
      target: opts.target,
      budgetMs,
    })

    try {
      return await promise
    } finally {
      opts.signal?.removeEventListener("abort", onAbort)
    }
  }

  setAutoQualityMode(mode: RenderQuality) {
    this.autoQuality.reset(mode)
  }

  private cancel(requestId: number) {
    const p = this.pending.get(requestId)
    if (!p) return
    this.pending.delete(requestId)
    this.post({ type: "cancel", requestId })
    p.reject(new DOMException("Aborted", "AbortError"))
  }

  private post(msg: RenderWorkerRequest) {
    this.worker.postMessage(msg)
  }

  private onWorkerMessage(msg: RenderWorkerResponse) {
    if (msg.type === "error") {
      const p = this.pending.get(msg.requestId)
      if (!p) return
      this.pending.delete(msg.requestId)
      p.reject(new Error(msg.message))
      return
    }
    const p = this.pending.get(msg.requestId)
    if (!p) {
      // Late response for a canceled request.
      try {
        msg.bitmap.close()
      } catch {
        // Ignore.
      }
      return
    }
    this.pending.delete(msg.requestId)
    const now = performance.now()
    const late = now - p.startedAt > p.budgetMs
    const nextMode = this.autoQuality.observeFrame({ late })
    void nextMode
    p.resolve({
      bitmap: msg.bitmap,
      presentedFrame: msg.presentedFrame,
      sourceQuality: msg.quality,
      stats: {
        requestId: msg.requestId,
        queuedAt: p.startedAt,
        startedAt: msg.startedAt,
        finishedAt: msg.finishedAt,
        budgetMs: msg.budgetMs,
        late,
        backend: "fake-worker",
      },
    })
  }
}

