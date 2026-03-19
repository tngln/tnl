import { JobScheduler } from "./scheduler"
import type { RenderGraphSnapshotV1, RenderQuality } from "./types"
import type { RenderWorkerRequest, RenderWorkerResponse } from "./worker_protocol"
import { theme, neutral } from "@tnl/canvas-interface/theme"

type PendingRender = {
  requestId: number
  canceled: boolean
}

const scheduler = new JobScheduler()
const pending = new Map<number, PendingRender>()
const jobIdByRequestId = new Map<number, number>()
let graph: RenderGraphSnapshotV1 | null = null
let intent = { playing: false, rate: 1, direction: 1 as 1 | -1, targetFrame: 0 }

function nowMs() {
  return typeof performance !== "undefined" ? performance.now() : Date.now()
}

function post(msg: RenderWorkerResponse, transfer?: Transferable[]) {
  ;(globalThis as any).postMessage(msg, transfer ?? [])
}

function ensureCanvas(w: number, h: number) {
  const c = new OffscreenCanvas(Math.max(1, Math.floor(w)), Math.max(1, Math.floor(h)))
  const ctx = c.getContext("2d", { alpha: false, desynchronized: true })
  if (!ctx) throw new Error("OffscreenCanvas 2D context unavailable")
  return { canvas: c, ctx }
}

function colorForQuality(q: RenderQuality) {
  return q === "proxy" ? neutral[850] : neutral[875]
}

async function renderFakeFrame(args: { frame: number; fps: number; w: number; h: number; quality: RenderQuality }) {
  const { canvas, ctx } = ensureCanvas(args.w, args.h)
  ctx.fillStyle = colorForQuality(args.quality)
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  // Simple debug overlay (v1).
  ctx.fillStyle = neutral[400]
  ctx.fillRect(0, 0, canvas.width, 40)
  ctx.fillStyle = neutral[100]
  ctx.font = "600 14px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
  ctx.textBaseline = "middle"
  ctx.fillText(`tnl render worker`, 12, 20)
  ctx.fillStyle = neutral[100]
  ctx.font = "12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
  ctx.fillText(`frame=${args.frame} fps=${args.fps} quality=${args.quality}`, 12, 20 + 18)

  // Small indicator influenced by graph/intent (for sanity checks).
  const hint = graph ? "graph:1" : "graph:0"
  ctx.fillText(`${hint} intent:${intent.playing ? "play" : "pause"} target:${intent.targetFrame}`, 12, 20 + 34)

  const bitmap = canvas.transferToImageBitmap()
  return bitmap
}

async function pump() {
  const job = scheduler.takeNext()
  if (!job) return
  const p = pending.get(job.id)
  if (!p) {
    void pump()
    return
  }
  if (p.canceled) {
    pending.delete(job.id)
    jobIdByRequestId.delete(p.requestId)
    void pump()
    return
  }

  const startedAt = nowMs()
  try {
    const bitmap = await renderFakeFrame({
      frame: job.frame,
      fps: job.fps,
      w: job.target.w,
      h: job.target.h,
      quality: job.quality,
    })
    if (p.canceled) {
      bitmap.close()
      return
    }
    const finishedAt = nowMs()
    post(
      {
        type: "rendered",
        requestId: p.requestId,
        presentedFrame: job.frame,
        quality: job.quality,
        bitmap,
        startedAt,
        finishedAt,
        budgetMs: job.budgetMs,
      },
      [bitmap],
    )
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    post({ type: "error", requestId: p.requestId, message: msg })
  } finally {
    pending.delete(job.id)
    jobIdByRequestId.delete(p.requestId)
    // Keep draining synchronously; the browser event loop will yield between tasks naturally.
    void pump()
  }
}

;(globalThis as any).addEventListener("message", (e: MessageEvent<RenderWorkerRequest>) => {
  const msg = e.data
  if (msg.type === "setGraph") {
    graph = msg.graph
    return
  }
  if (msg.type === "setIntent") {
    intent = msg.intent
    return
  }
  if (msg.type === "cancel") {
    // Worker-side best-effort cancel.
    const jobId = jobIdByRequestId.get(msg.requestId) ?? null
    if (jobId !== null) {
      const entry = pending.get(jobId)
      if (entry) entry.canceled = true
      scheduler.cancelByPredicate((j) => j.id === jobId)
      jobIdByRequestId.delete(msg.requestId)
    }
    return
  }
  if (msg.type === "render") {
    // Store per-request cancellation and enqueue a job.
    const jobId = scheduler.enqueue({
      frame: msg.frame,
      quality: msg.quality,
      reason: msg.reason,
      targetFrame: intent.targetFrame,
      target: msg.target,
      budgetMs: msg.budgetMs,
      fps: msg.fps,
    })
    pending.set(jobId, { requestId: msg.requestId, canceled: false })
    jobIdByRequestId.set(msg.requestId, jobId)
    void pump()
  }
})
