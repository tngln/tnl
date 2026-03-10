import type { RenderReason, RenderQuality, RenderTarget } from "./types"

export type RenderJob = {
  id: number
  frame: number
  quality: RenderQuality
  reason: RenderReason
  targetFrame: number
  target: RenderTarget
  budgetMs: number
  fps: number
  enqueuedAt: number
}

export function jobPriority(job: RenderJob) {
  // Higher is better.
  const reasonBase =
    job.reason === "scrub" ? 1_000_000 :
    job.reason === "playback" ? 800_000 :
    job.reason === "thumbnail" ? 200_000 :
    100_000 // export (offline) is lowest priority in interactive UI

  // Prefer jobs closer to the playhead/target.
  const dist = Math.abs(job.frame - job.targetFrame)
  const distScore = Math.max(0, 100_000 - dist)

  // Prefer full quality slightly, but not enough to beat scrub/playback priorities.
  const qualityBias = job.quality === "full" ? 10 : 0

  return reasonBase + distScore + qualityBias
}

export class JobScheduler {
  private readonly jobs: RenderJob[] = []
  private nextId = 1

  enqueue(job: Omit<RenderJob, "id" | "enqueuedAt">) {
    const full: RenderJob = { ...job, id: this.nextId++, enqueuedAt: Date.now() }
    this.jobs.push(full)
    return full.id
  }

  cancelByPredicate(pred: (job: RenderJob) => boolean) {
    const before = this.jobs.length
    for (let i = this.jobs.length - 1; i >= 0; i--) {
      if (pred(this.jobs[i]!)) this.jobs.splice(i, 1)
    }
    return before - this.jobs.length
  }

  takeNext(): RenderJob | null {
    if (!this.jobs.length) return null
    let bestIdx = 0
    let bestScore = jobPriority(this.jobs[0]!)
    for (let i = 1; i < this.jobs.length; i++) {
      const score = jobPriority(this.jobs[i]!)
      if (score > bestScore) {
        bestScore = score
        bestIdx = i
      }
    }
    return this.jobs.splice(bestIdx, 1)[0] ?? null
  }

  size() {
    return this.jobs.length
  }
}
