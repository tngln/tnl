import type { RenderQuality } from "./types"

export type AutoQualityConfig = {
  degradeAfterLateFrames: number
  recoverAfterOnTimeFrames: number
}

export type AutoQualityState = {
  mode: "full" | "proxy"
  consecutiveLate: number
  consecutiveOnTime: number
}

export class AutoQualityController {
  private readonly cfg: AutoQualityConfig
  private state: AutoQualityState

  constructor(cfg: Partial<AutoQualityConfig> = {}) {
    this.cfg = {
      degradeAfterLateFrames: Math.max(1, cfg.degradeAfterLateFrames ?? 3),
      recoverAfterOnTimeFrames: Math.max(1, cfg.recoverAfterOnTimeFrames ?? 12),
    }
    this.state = { mode: "full", consecutiveLate: 0, consecutiveOnTime: 0 }
  }

  snapshot(): AutoQualityState {
    return { ...this.state }
  }

  reset(mode: RenderQuality = "full") {
    this.state = { mode, consecutiveLate: 0, consecutiveOnTime: 0 }
  }

  observeFrame(result: { late: boolean }): RenderQuality {
    const s = this.state
    if (result.late) {
      s.consecutiveLate += 1
      s.consecutiveOnTime = 0
    } else {
      s.consecutiveOnTime += 1
      s.consecutiveLate = 0
    }

    if (s.mode === "full" && s.consecutiveLate >= this.cfg.degradeAfterLateFrames) {
      s.mode = "proxy"
      s.consecutiveLate = 0
      s.consecutiveOnTime = 0
    } else if (s.mode === "proxy" && s.consecutiveOnTime >= this.cfg.recoverAfterOnTimeFrames) {
      s.mode = "full"
      s.consecutiveLate = 0
      s.consecutiveOnTime = 0
    }
    return s.mode
  }
}

