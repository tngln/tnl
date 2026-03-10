import { openOpfs, type OpfsEntryV1 } from "../../core/opfs"
import { createLogger } from "../../core/debug"
import { describeError, toAppError, toErrorInfo } from "../../core/errors"
import type { TimelineTrackModel, TimelineViewModel } from "../timeline/model"
import { pickFiles } from "../../platform/web/file_io"
import { PlaybackRuntime, type PlaybackRuntimeSnapshot } from "../../platform/web/playback"
import { invalidateAll } from "../invalidate"

const DEFAULT_SOURCE_PATH = "media/bbb.mp4"
const DEFAULT_FPS = 30
const sessionLog = createLogger("playback.session")

export type PlaybackSessionSnapshot = {
  entries: OpfsEntryV1[]
  selectedPath: string | null
  busy: boolean
  error: string | null
  runtime: PlaybackRuntimeSnapshot
}

function basename(path: string | null) {
  if (!path) return "No source"
  const idx = path.lastIndexOf("/")
  return idx >= 0 ? path.slice(idx + 1) : path
}

function isVideoEntry(entry: Pick<OpfsEntryV1, "path" | "type">) {
  if (entry.type.toLowerCase().startsWith("video/")) return true
  return /\.(mp4|webm|mov|m4v|mkv|ogv)$/i.test(entry.path)
}

export class PlaybackSession {
  private readonly listeners = new Set<() => void>()
  private readonly runtime = new PlaybackRuntime()
  private readonly timeline: TimelineViewModel = {
    rangeStart: 0,
    rangeEnd: 300,
    baseUnit: 1,
    fps: DEFAULT_FPS,
    playhead: 0,
    tracks: [
      {
        id: "video-1",
        name: "Video 1",
        kind: "video",
        height: 56,
        items: [],
      },
    ],
    onSeek: (frame) => this.seekFrame(frame),
  }
  private entries: OpfsEntryV1[] = []
  private selectedPath: string | null = null
  private busy = false
  private error: string | null = null
  private initialized = false
  private fsPromise: ReturnType<typeof openOpfs> | null = null

  constructor() {
    this.runtime.subscribe(() => {
      this.syncTimeline()
      this.notify()
    })
  }

  ensureInitialized() {
    if (this.initialized) return
    this.initialized = true
    sessionLog.info("Initializing playback session")
    void this.refreshEntries().then(async () => {
      const preferred = this.entries.find((entry) => entry.path === DEFAULT_SOURCE_PATH)
      const fallback = preferred ?? this.entries[0] ?? null
      if (fallback) {
        sessionLog.info("Selecting initial playback source", { path: fallback.path, preferred: fallback.path === DEFAULT_SOURCE_PATH })
        await this.selectPath(fallback.path)
      }
    })
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  snapshot(): PlaybackSessionSnapshot {
    return {
      entries: this.entries,
      selectedPath: this.selectedPath,
      busy: this.busy,
      error: this.error,
      runtime: this.runtime.snapshot(),
    }
  }

  runtimeSnapshot() {
    return this.runtime.snapshot()
  }

  drawVideo(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, rect: { x: number; y: number; w: number; h: number }) {
    return this.runtime.drawVideo(ctx, rect)
  }

  timelineView() {
    return this.timeline
  }

  async refreshEntries() {
    this.busy = true
    this.error = null
    sessionLog.debug("Refreshing playback media list")
    this.notify()
    try {
      const fs = await this.ensureFs()
      this.entries = (await fs.list()).filter(isVideoEntry).sort((a, b) => a.path.localeCompare(b.path))
      if (this.selectedPath && !this.entries.some((entry) => entry.path === this.selectedPath)) this.selectedPath = null
      this.syncTimeline()
      sessionLog.info("Playback media list refreshed", { entries: this.entries.map((entry) => entry.path) })
    } catch (error) {
      const appError = toAppError(error, {
        domain: "playback",
        code: "RefreshEntriesFailed",
        message: "Failed to refresh playback media entries",
      })
      this.error = describeError(appError)
      sessionLog.error("Failed to refresh playback media list", { error: toErrorInfo(appError) })
    } finally {
      this.busy = false
      this.notify()
    }
  }

  async importFiles() {
    this.busy = true
    this.error = null
    sessionLog.debug("Importing playback media files")
    this.notify()
    try {
      const files = await pickFiles({ multiple: true, accept: "video/*,.mp4,.webm,.mov,.m4v,.mkv,.ogv", inputId: "tnl-playback-import-input" })
      if (!files.length) return
      const fs = await this.ensureFs()
      for (const file of files) {
        await fs.writeFile(`media/${file.name}`, file, { type: file.type || undefined })
      }
      await this.refreshEntries()
      await this.selectPath(`media/${files[0].name}`)
      sessionLog.info("Playback media import completed", { files: files.map((file) => file.name) })
    } catch (error) {
      const appError = toAppError(error, {
        domain: "playback",
        code: "ImportFailed",
        message: "Failed to import playback media",
      })
      this.error = describeError(appError)
      sessionLog.error("Playback media import failed", { error: toErrorInfo(appError) })
    } finally {
      this.busy = false
      this.notify()
    }
  }

  async selectPath(path: string) {
    this.busy = true
    this.error = null
    this.selectedPath = path
    sessionLog.info("Selecting playback source", { path })
    this.notify()
    try {
      const fs = await this.ensureFs()
      const entry = this.entries.find((candidate) => candidate.path === path) ?? null
      const blob = await fs.readFile(path)
      await this.runtime.loadBlob(blob, path, entry?.type)
      this.syncTimeline()
    } catch (error) {
      const appError = toAppError(error, {
        domain: "playback",
        code: "SelectPathFailed",
        message: `Failed to select playback source: ${path}`,
        details: { path },
      })
      this.error = describeError(appError)
      sessionLog.error("Playback source selection failed", { error: toErrorInfo(appError) })
    } finally {
      this.busy = false
      this.notify()
    }
  }

  togglePlayPause() {
    return this.runtime.togglePlayPause()
  }

  play() {
    return this.runtime.play()
  }

  pause() {
    this.runtime.pause()
  }

  seekTo(seconds: number) {
    this.runtime.seekTo(seconds)
  }

  seekFrame(frame: number) {
    const fps = this.timeline.fps ?? DEFAULT_FPS
    this.runtime.seekTo(frame / Math.max(1, fps))
  }

  stepFrame(delta: -1 | 1) {
    this.runtime.stepFrame(delta)
  }

  setVolume(volume: number) {
    this.runtime.setVolume(volume)
  }

  toggleMuted() {
    this.runtime.toggleMuted()
  }

  setMuted(muted: boolean) {
    this.runtime.setMuted(muted)
  }

  setPlaybackRate(rate: number) {
    this.runtime.setPlaybackRate(rate)
  }

  dispose() {
    this.runtime.dispose()
    this.listeners.clear()
  }

  private async ensureFs() {
    if (!this.fsPromise) this.fsPromise = openOpfs()
    return await this.fsPromise
  }

  private syncTimeline() {
    const runtime = this.runtime.snapshot()
    const fps = Math.max(1, Math.round(runtime.frameRate ?? this.timeline.fps ?? DEFAULT_FPS))
    const durationFrames = Math.max(1, Math.round(runtime.duration * fps))
    const playhead = Math.max(0, runtime.currentTime * fps)
    const clipLabel = basename(this.selectedPath)
    const track: TimelineTrackModel = {
      id: "video-1",
      name: clipLabel,
      kind: "video",
      height: 56,
      items: this.selectedPath
        ? [{ id: "clip-1", start: 0, duration: durationFrames, label: clipLabel, color: "#4f8cff", selected: true }]
        : [],
    }
    this.timeline.fps = fps
    this.timeline.playhead = playhead
    this.timeline.rangeStart = 0
    this.timeline.rangeEnd = Math.max(durationFrames + fps * 2, fps * 5)
    this.timeline.tracks = [track]
    this.timeline.selection = this.selectedPath ? { trackId: track.id, itemId: "clip-1" } : undefined
  }

  private notify() {
    invalidateAll()
    for (const listener of this.listeners) listener()
  }
}

let singleton: PlaybackSession | null = null

export function getPlaybackSession() {
  if (!singleton) singleton = new PlaybackSession()
  return singleton
}