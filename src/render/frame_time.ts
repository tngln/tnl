import type { FrameTime } from "./types"

export function normalizeFps(fps: number) {
  return Math.max(1, Math.round(Number.isFinite(fps) ? fps : 30))
}

export function frameTime(frame: number, fps: number): FrameTime {
  return { frame, fps: normalizeFps(fps) }
}

export function frameToSeconds(frame: number, fps: number) {
  const f = normalizeFps(fps)
  return frame / f
}

export function secondsToFrame(seconds: number, fps: number) {
  const f = normalizeFps(fps)
  return seconds * f
}

export function quantizeFrame(frame: number) {
  // v1: snap to integer frames; allow future sub-frame by changing this behavior in one place.
  return Math.round(frame)
}

