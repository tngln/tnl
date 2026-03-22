import { scheduleAnimationFrame } from "@tnl/canvas-interface/platform/web"
import { createLogger } from "@tnl/canvas-interface/debug"
import { AppError, describeError, toAppError, toErrorInfo } from "@tnl/canvas-interface/errors"
import { getSeekableEnd, probeVideoDuration, resolvePlaybackDuration, type PlaybackDurationInfo, type PlaybackDurationSource } from "./video_duration"
import { inferMimeCandidates, isAviPath } from "./media_formats"

type VideoFrameCallback = (now: number, metadata: { mediaTime?: number; presentedFrames?: number }) => void

type ManagedVideo = HTMLVideoElement & {
  requestVideoFrameCallback?: (callback: VideoFrameCallback) => number
  cancelVideoFrameCallback?: (handle: number) => void
}

const playbackLog = createLogger("playback.runtime")

export type { PlaybackDurationInfo, PlaybackDurationSource } from "./video_duration"
export { resolvePlaybackDuration } from "./video_duration"

export type PlaybackRuntimeSnapshot = {
  sourcePath: string | null
  ready: boolean
  loading: boolean
  playing: boolean
  duration: number
  durationSource: PlaybackDurationSource
  rawDuration: number
  seekableEnd: number
  currentTime: number
  volume: number
  muted: boolean
  playbackRate: number
  width: number
  height: number
  frameRate: number | null
  blobType: string | null
  resolvedMime: string | null
  canPlayType: string
  readyState: number
  networkState: number
  errorCode: number | null
  error: string | null
}

function pickPlayableMime(video: HTMLVideoElement, candidates: string[]) {
  for (const candidate of candidates) {
    const can = video.canPlayType(candidate)
    if (can) return { mime: candidate, canPlayType: can }
  }
  return { mime: null, canPlayType: "" }
}

function shouldOverrideMime(type: string | null) {
  if (!type) return true
  const normalized = type.trim().toLowerCase()
  return !normalized || normalized === "application/octet-stream"
}

function createManagedVideoElement() {
  if (typeof document === "undefined") return null
  const video = document.createElement("video") as ManagedVideo
  video.preload = "metadata"
  video.controls = false
  video.playsInline = true
  video.crossOrigin = "anonymous"
  video.style.position = "fixed"
  video.style.left = "-10000px"
  video.style.top = "-10000px"
  video.style.width = "1px"
  video.style.height = "1px"
  video.style.opacity = "0"
  video.style.pointerEvents = "none"
  video.setAttribute("aria-hidden", "true")
  document.body.appendChild(video)
  return video
}

export class PlaybackRuntime {
  private readonly video = createManagedVideoElement()
  private readonly listeners = new Set<() => void>()
  private objectUrl: string | null = null
  private frameHandle: number | null = null
  private rafHandle: number | null = null
  private sourcePath: string | null = null
  private loading = false
  private error: string | null = null
  private frameRate: number | null = null
  private lastFrameTime: number | null = null
  private boundFrameLoop: VideoFrameCallback | null = null
  private blobType: string | null = null
  private resolvedMime: string | null = null
  private playbackRate = 1
  private recoveredDuration: number | null = null

  constructor() {
    const video = this.video
    if (!video) return
    const emit = () => this.notify()
    video.addEventListener("loadedmetadata", emit)
    video.addEventListener("loadeddata", emit)
    video.addEventListener("durationchange", emit)
    video.addEventListener("timeupdate", emit)
    video.addEventListener("play", () => {
      this.error = null
      this.startFrameLoop()
      emit()
    })
    video.addEventListener("pause", () => {
      this.stopFrameLoop()
      emit()
    })
    video.addEventListener("seeked", emit)
    video.addEventListener("seeking", emit)
    video.addEventListener("volumechange", emit)
    video.addEventListener("ended", () => {
      this.stopFrameLoop()
      emit()
    })
    video.addEventListener("error", () => {
      this.error = video.error?.message ?? "Failed to load video"
      this.loading = false
      this.stopFrameLoop()
      emit()
    })
  }

  snapshot(): PlaybackRuntimeSnapshot {
    const video = this.video
    const durationInfo = this.readDurationInfo(video)
    return {
      sourcePath: this.sourcePath,
      ready: Boolean(video && video.videoWidth > 0 && video.videoHeight > 0 && durationInfo.duration > 0),
      loading: this.loading,
      playing: Boolean(video && !video.paused && !video.ended),
      duration: durationInfo.duration,
      durationSource: durationInfo.source,
      rawDuration: durationInfo.rawDuration,
      seekableEnd: durationInfo.seekableEnd,
      currentTime: video?.currentTime ?? 0,
      volume: video?.volume ?? 1,
      muted: video?.muted ?? false,
      playbackRate: video?.playbackRate ?? this.playbackRate,
      width: video?.videoWidth ?? 0,
      height: video?.videoHeight ?? 0,
      frameRate: this.frameRate,
      blobType: this.blobType,
      resolvedMime: this.resolvedMime,
      canPlayType: video && this.resolvedMime ? video.canPlayType(this.resolvedMime) : "",
      readyState: video?.readyState ?? 0,
      networkState: video?.networkState ?? 0,
      errorCode: video?.error?.code ?? null,
      error: this.error,
    }
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  async loadBlob(blob: Blob, path: string, typeHint?: string) {
    const video = this.video
    if (!video) {
      const error = new AppError({
        domain: "playback",
        code: "VideoElementUnavailable",
        message: "HTMLVideoElement is not available in this environment",
        details: { path },
      })
      this.error = describeError(error)
      playbackLog.error("Playback video element is unavailable", { error: toErrorInfo(error) })
      this.notify()
      throw error
    }
    this.loading = true
    this.error = null
    this.sourcePath = path
    this.frameRate = null
    this.lastFrameTime = null
    this.recoveredDuration = null
    this.blobType = blob.type || null
    const incomingType = typeHint || blob.type || null
    const candidates = inferMimeCandidates(path, shouldOverrideMime(incomingType) ? null : incomingType)
    const picked = pickPlayableMime(video, candidates)
    if (picked.mime) {
      this.resolvedMime = shouldOverrideMime(incomingType) ? picked.mime : incomingType
    } else {
      this.resolvedMime = shouldOverrideMime(incomingType) ? null : incomingType
      const message = isAviPath(path)
        ? "AVI is not playable in this Chrome build. Convert to WebM (VP9/Opus) or MP4 (H.264/AAC)."
        : "Unsupported video format."
      const error = new AppError({
        domain: "playback",
        code: "UnsupportedFormat",
        message,
        details: {
          path,
          blobType: this.blobType,
          typeHint: typeHint || null,
          mimeCandidates: candidates,
        },
      })
      this.loading = false
      this.error = describeError(error)
      playbackLog.error("Playback source is not playable", { error: toErrorInfo(error) })
      this.notify()
      throw error
    }
    playbackLog.info("Loading playback source", {
      path,
      blobType: this.blobType,
      typeHint: typeHint || null,
      resolvedMime: this.resolvedMime,
    })
    this.revokeObjectUrl()
    const playableBlob = this.resolvedMime && this.resolvedMime !== blob.type ? new Blob([blob], { type: this.resolvedMime }) : blob
    this.objectUrl = URL.createObjectURL(playableBlob)
    video.pause()
    video.src = this.objectUrl
    video.playbackRate = this.playbackRate
    video.load()
    this.notify()
    try {
      await new Promise<void>((resolve, reject) => {
        const onLoaded = () => {
          cleanup()
          resolve()
        }
        const onError = () => {
          cleanup()
          reject(new Error(video.error?.message ?? `Failed to load ${path}`))
        }
        const cleanup = () => {
          video.removeEventListener("loadedmetadata", onLoaded)
          video.removeEventListener("error", onError)
        }
        video.addEventListener("loadedmetadata", onLoaded)
        video.addEventListener("error", onError)
      })
      await this.recoverDurationIfNeeded(video, path)
      this.loading = false
      const durationInfo = this.readDurationInfo(video)
      playbackLog.info("Playback source loaded", {
        path,
        duration: durationInfo.duration,
        durationSource: durationInfo.source,
        rawDuration: durationInfo.rawDuration,
        seekableEnd: durationInfo.seekableEnd,
        width: video.videoWidth,
        height: video.videoHeight,
        readyState: video.readyState,
        networkState: video.networkState,
        canPlayType: this.resolvedMime ? video.canPlayType(this.resolvedMime) : "",
      })
      this.notify()
    } catch (error) {
      const appError = toAppError(error, {
        domain: "playback",
        code: "LoadFailed",
        message: `Failed to load video: ${path}`,
        details: {
          path,
          blobType: this.blobType,
          resolvedMime: this.resolvedMime,
          readyState: video.readyState,
          networkState: video.networkState,
          mediaErrorCode: video.error?.code ?? null,
        },
      })
      this.loading = false
      this.error = describeError(appError)
      playbackLog.error("Failed to load playback source", { error: toErrorInfo(appError) })
      this.notify()
      throw appError
    }
  }

  async play() {
    const video = this.video
    if (!video) return
    this.error = null
    try {
      await video.play()
      playbackLog.debug("Playback started", {
        path: this.sourcePath,
        currentTime: video.currentTime,
        playbackRate: video.playbackRate,
      })
      this.startFrameLoop()
      this.notify()
    } catch (error) {
      const appError = toAppError(error, {
        domain: "playback",
        code: "PlayFailed",
        message: `Failed to start playback${this.sourcePath ? ` for ${this.sourcePath}` : ""}`,
        details: { path: this.sourcePath, playbackRate: video.playbackRate },
      })
      this.error = describeError(appError)
      playbackLog.error("Playback start failed", { error: toErrorInfo(appError) })
      this.notify()
    }
  }

  pause() {
    const video = this.video
    if (!video) return
    video.pause()
    playbackLog.debug("Playback paused", { path: this.sourcePath, currentTime: video.currentTime })
    this.stopFrameLoop()
    this.notify()
  }

  togglePlayPause() {
    const video = this.video
    if (!video) return Promise.resolve()
    return video.paused ? this.play() : Promise.resolve(this.pause())
  }

  seekTo(seconds: number) {
    const video = this.video
    if (!video) return
    const duration = this.readDurationInfo(video).duration
    video.currentTime = Math.max(0, Math.min(duration, seconds))
    playbackLog.trace("Playback seek", { path: this.sourcePath, currentTime: video.currentTime, requestedTime: seconds })
    this.notify()
  }

  stepFrame(delta: -1 | 1) {
    const video = this.video
    if (!video) return
    video.pause()
    const fps = this.frameRate && this.frameRate > 0 ? this.frameRate : 30
    const step = 1 / fps
    playbackLog.debug("Playback frame step", { path: this.sourcePath, delta, fps, currentTime: video.currentTime })
    this.seekTo((video.currentTime ?? 0) + delta * step)
  }

  setVolume(volume: number) {
    const video = this.video
    if (!video) return
    video.volume = Math.max(0, Math.min(1, volume))
    if (video.volume > 0 && video.muted) video.muted = false
    if (video.volume <= 0) video.muted = true
    playbackLog.trace("Playback volume changed", { path: this.sourcePath, volume: video.volume, muted: video.muted })
    this.notify()
  }

  setMuted(muted: boolean) {
    const video = this.video
    if (!video) return
    video.muted = muted
    playbackLog.debug("Playback mute toggled", { path: this.sourcePath, muted })
    this.notify()
  }

  toggleMuted() {
    const video = this.video
    if (!video) return
    video.muted = !video.muted
    this.notify()
  }

  setPlaybackRate(rate: number) {
    const video = this.video
    const next = Math.max(0.25, Math.min(4, rate))
    this.playbackRate = next
    if (video) video.playbackRate = next
    playbackLog.debug("Playback rate changed", { path: this.sourcePath, playbackRate: next })
    this.notify()
  }

  drawVideo(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, rect: { x: number; y: number; w: number; h: number }) {
    const video = this.video
    if (!video || video.readyState < 2 || video.videoWidth <= 0 || video.videoHeight <= 0) return false
    const scale = Math.min(rect.w / video.videoWidth, rect.h / video.videoHeight)
    const drawW = Math.max(1, video.videoWidth * scale)
    const drawH = Math.max(1, video.videoHeight * scale)
    const drawX = rect.x + (rect.w - drawW) / 2
    const drawY = rect.y + (rect.h - drawH) / 2
    ;(ctx as CanvasRenderingContext2D).drawImage(video, drawX, drawY, drawW, drawH)
    return true
  }

  dispose() {
    this.stopFrameLoop()
    const video = this.video
    if (video) {
      video.pause()
      video.removeAttribute("src")
      video.load()
      video.remove()
    }
    this.revokeObjectUrl()
    this.listeners.clear()
  }

  private notify() {
    for (const listener of this.listeners) listener()
  }

  private revokeObjectUrl() {
    if (!this.objectUrl) return
    URL.revokeObjectURL(this.objectUrl)
    this.objectUrl = null
  }

  private readDurationInfo(video: HTMLVideoElement | null): PlaybackDurationInfo {
    return resolvePlaybackDuration(video?.duration ?? 0, getSeekableEnd(video), this.recoveredDuration)
  }

  private async recoverDurationIfNeeded(video: HTMLVideoElement, path: string) {
    const before = this.readDurationInfo(video)
    if (before.duration > 0) return before
    playbackLog.warn("Playback duration is not finite; attempting recovery", {
      path,
      rawDuration: before.rawDuration,
      seekableEnd: before.seekableEnd,
    })
    const recovered = await probeVideoDuration(video)
    if (recovered > 0) {
      this.recoveredDuration = recovered
      playbackLog.info("Recovered playback duration from non-finite metadata", {
        path,
        recoveredDuration: recovered,
      })
      this.notify()
      return this.readDurationInfo(video)
    }
    const after = this.readDurationInfo(video)
    playbackLog.warn("Playback duration recovery did not yield a finite duration", {
      path,
      rawDuration: after.rawDuration,
      seekableEnd: after.seekableEnd,
    })
    return after
  }

  private startFrameLoop() {
    const video = this.video
    if (!video) return
    this.stopFrameLoop()
    if (typeof video.requestVideoFrameCallback === "function") {
      this.boundFrameLoop = (_now, metadata) => {
        if (typeof metadata.mediaTime === "number" && this.lastFrameTime !== null) {
          const dt = metadata.mediaTime - this.lastFrameTime
          if (dt > 0.001) this.frameRate = 1 / dt
        }
        if (typeof metadata.mediaTime === "number") this.lastFrameTime = metadata.mediaTime
        this.notify()
        if (!video.paused && !video.ended) this.frameHandle = video.requestVideoFrameCallback!(this.boundFrameLoop!)
      }
      this.frameHandle = video.requestVideoFrameCallback(this.boundFrameLoop)
      return
    }
    const tick = () => {
      this.notify()
      if (video.paused || video.ended) return
      this.rafHandle = scheduleAnimationFrame(() => tick())
    }
    this.rafHandle = scheduleAnimationFrame(() => tick())
  }

  private stopFrameLoop() {
    const video = this.video
    if (video && this.frameHandle !== null && typeof video.cancelVideoFrameCallback === "function") {
      video.cancelVideoFrameCallback(this.frameHandle)
    }
    if (this.rafHandle !== null && typeof cancelAnimationFrame === "function") cancelAnimationFrame(this.rafHandle)
    this.frameHandle = null
    this.rafHandle = null
    this.boundFrameLoop = null
  }
}
