export type PlaybackDurationSource = "metadata" | "recovered" | "seekable" | "unknown"

export type PlaybackDurationInfo = {
  duration: number
  source: PlaybackDurationSource
  rawDuration: number
  seekableEnd: number
}

function normalizeDurationValue(value: number | null | undefined) {
  return Number.isFinite(value) && (value ?? 0) > 0 ? (value as number) : 0
}

export function getSeekableEnd(video: HTMLVideoElement | null) {
  if (!video || video.seekable.length <= 0) return 0
  try {
    return normalizeDurationValue(video.seekable.end(video.seekable.length - 1))
  } catch {
    return 0
  }
}

export function resolvePlaybackDuration(rawDuration: number, seekableEnd: number, recoveredDuration: number | null): PlaybackDurationInfo {
  if (Number.isFinite(rawDuration) && rawDuration > 0) {
    return { duration: rawDuration, source: "metadata", rawDuration, seekableEnd: normalizeDurationValue(seekableEnd) }
  }
  if (Number.isFinite(recoveredDuration) && (recoveredDuration ?? 0) > 0) {
    return { duration: recoveredDuration ?? 0, source: "recovered", rawDuration, seekableEnd: normalizeDurationValue(seekableEnd) }
  }
  const normalizedSeekableEnd = normalizeDurationValue(seekableEnd)
  if (normalizedSeekableEnd > 0) {
    return { duration: normalizedSeekableEnd, source: "seekable", rawDuration, seekableEnd: normalizedSeekableEnd }
  }
  return { duration: 0, source: "unknown", rawDuration, seekableEnd: normalizedSeekableEnd }
}

export async function probeVideoDuration(video: HTMLVideoElement, opts?: { timeoutMs?: number; seekSeconds?: number }) {
  const existing = resolvePlaybackDuration(video.duration, getSeekableEnd(video), null)
  if (existing.duration > 0) return existing.duration
  const timeoutMs = Math.max(0, opts?.timeoutMs ?? 1500)
  const seekSeconds = Math.max(0, opts?.seekSeconds ?? 24 * 60 * 60)
  const originalTime = Number.isFinite(video.currentTime) ? video.currentTime : 0
  return await new Promise<number>((resolve) => {
    let done = false
    let timeoutId = 0
    const finish = (reason: string) => {
      if (done) return
      done = true
      cleanup()
      const resolvedDuration = resolvePlaybackDuration(video.duration, getSeekableEnd(video), null).duration
      try {
        video.currentTime = Math.min(originalTime, resolvedDuration || originalTime)
      } catch {}
      resolve(resolvedDuration)
    }
    const onDurationChange = () => {
      if (resolvePlaybackDuration(video.duration, getSeekableEnd(video), null).duration > 0) finish("durationchange")
    }
    const onSeeked = () => {
      if (resolvePlaybackDuration(video.duration, getSeekableEnd(video), null).duration > 0) finish("seeked")
    }
    const onTimeUpdate = () => {
      if (resolvePlaybackDuration(video.duration, getSeekableEnd(video), null).duration > 0) finish("timeupdate")
    }
    const cleanup = () => {
      if (timeoutId) clearTimeout(timeoutId)
      video.removeEventListener("durationchange", onDurationChange)
      video.removeEventListener("seeked", onSeeked)
      video.removeEventListener("timeupdate", onTimeUpdate)
    }
    video.addEventListener("durationchange", onDurationChange)
    video.addEventListener("seeked", onSeeked)
    video.addEventListener("timeupdate", onTimeUpdate)
    timeoutId = setTimeout(() => finish("timeout"), timeoutMs) as unknown as number
    try {
      video.currentTime = seekSeconds
    } catch {
      finish("seek-throw")
    }
  })
}

