export function formatTimecode(seconds: number, fps: number) {
  const safeFps = Math.max(1, Math.round(Number.isFinite(fps) ? fps : 30))
  const totalFrames = Math.max(0, Math.round((Number.isFinite(seconds) ? seconds : 0) * safeFps))
  const frames = totalFrames % safeFps
  const totalSeconds = Math.floor(totalFrames / safeFps)
  const secs = totalSeconds % 60
  const mins = Math.floor(totalSeconds / 60) % 60
  const hours = Math.floor(totalSeconds / 3600)
  const frameDigits = Math.max(2, String(safeFps - 1).length)
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}+${String(frames).padStart(frameDigits, "0")}`
}