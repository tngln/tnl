import { theme } from "@/config/theme"
import { normalizePath, openOpfs, type OpfsEntryV1 } from "@/core/opfs"
import { signal } from "@/core/reactivity"
import { getSeekableEnd, probeVideoDuration, resolvePlaybackDuration } from "@/platform/web/video_duration"
import { showConfirm, showPrompt } from "@/platform/web/dialogs"
import { downloadBlob, pickFiles } from "@/platform/web/file_io"
import { buildAcceptString } from "@/platform/web/media_formats"
import { baseName, dirName, formatBytes, formatLocalTime } from "@/util/util"
import type { Surface } from "@/ui/base/viewport"
import { Button, ClickArea, HStack, ListRow, Paint, PanelActionRow, PanelColumn, PanelHeader, PanelScroll, PanelToolbar, Spacer, Stack, Text, TextBox, VStack } from "@/ui/builder/components"
import { defineSurface, mountSurface } from "@/ui/builder/surface_builder"
import { invalidateAll } from "@/ui/invalidate"
import { createElement, Fragment } from "@/ui/jsx"

export const EXPLORER_WINDOW_ID = "Explorer"

export function createExplorerSurface(): Surface {
  return mountSurface(ExplorerSurface, {})
}

type ExplorerItem =
  | { kind: "dir"; name: string; path: string }
  | { kind: "file"; name: string; path: string; entry: OpfsEntryV1 }

type ThumbState =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "ready"; img: HTMLImageElement; url: string }
  | { state: "error"; error: string }

function thumbDebugEnabled() {
  return (globalThis as any).__TNL_EXPLORER_THUMB_DEBUG__ === true
}

function thumbLog(...args: any[]) {
  if (!thumbDebugEnabled()) return
  console.log(...args)
}

function isHiddenName(name: string) {
  return name.startsWith(".")
}

function isVideoEntry(entry: OpfsEntryV1) {
  if (typeof entry.type === "string" && entry.type.startsWith("video/")) return true
  const n = entry.name.toLowerCase()
  return n.endsWith(".mp4") || n.endsWith(".webm") || n.endsWith(".mov") || n.endsWith(".mkv")
}

function isStringRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v)
}

async function loadImageFromBlob(blob: Blob): Promise<{ img: HTMLImageElement; url: string }> {
  const url = URL.createObjectURL(blob)
  try {
    const img = new Image()
    const done = new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error("Image decode failed"))
    })
    img.src = url
    await done
    return { img, url }
  } catch (e) {
    URL.revokeObjectURL(url)
    throw e
  }
}

function coerceVideoBlob(blob: Blob, hint: { path: string; mimeHint?: string | null }) {
  const existing = (blob.type ?? "").trim().toLowerCase()
  if (existing.startsWith("video/")) return blob
  const hinted = (hint.mimeHint ?? "").trim().toLowerCase()
  if (hinted.startsWith("video/")) return new Blob([blob], { type: hinted })
  const p = hint.path.toLowerCase()
  if (p.endsWith(".webm")) return new Blob([blob], { type: "video/webm" })
  if (p.endsWith(".mp4") || p.endsWith(".m4v") || p.endsWith(".mov")) return new Blob([blob], { type: "video/mp4" })
  if (p.endsWith(".ogv")) return new Blob([blob], { type: "video/ogg" })
  if (p.endsWith(".mkv")) return new Blob([blob], { type: "video/x-matroska" })
  return blob
}

function withTimeout<T>(p: Promise<T>, timeoutMs: number, label: string) {
  const ms = Math.max(0, timeoutMs)
  return new Promise<T>((resolve, reject) => {
    const id = setTimeout(() => reject(new Error(`Timeout: ${label}`)), ms)
    p.then(
      (v) => {
        clearTimeout(id)
        resolve(v)
      },
      (e) => {
        clearTimeout(id)
        reject(e)
      },
    )
  })
}

function waitForFrameOrTick(video: HTMLVideoElement) {
  return new Promise<void>((resolve) => {
    let done = false
    const finish = (reason: string) => {
      if (done) return
      done = true
      thumbLog("[ExplorerThumb] frame:resolve", { reason })
      resolve()
    }
    const managed = video as any
    if (typeof managed.requestVideoFrameCallback === "function") {
      try {
        managed.requestVideoFrameCallback(() => finish("rvfc"))
      } catch {
        // Fall through to tick.
      }
    }
    setTimeout(() => finish("tick"), 0)
  })
}

function detectHasAudio(video: HTMLVideoElement): boolean | null {
  const anyVideo = video as any
  if (typeof anyVideo.mozHasAudio === "boolean") return anyVideo.mozHasAudio
  if (typeof anyVideo.webkitAudioDecodedByteCount === "number") return anyVideo.webkitAudioDecodedByteCount > 0
  if (anyVideo.audioTracks && typeof anyVideo.audioTracks.length === "number") return anyVideo.audioTracks.length > 0
  if (typeof anyVideo.captureStream === "function") {
    try {
      const stream = anyVideo.captureStream()
      if (stream && typeof stream.getAudioTracks === "function") return stream.getAudioTracks().length > 0
    } catch {}
  }
  return null
}

async function probeFrameRate(video: HTMLVideoElement) {
  const anyVideo = video as any
  if (typeof anyVideo.requestVideoFrameCallback !== "function") return null
  return await new Promise<number | null>((resolve) => {
    let done = false
    let timeoutId = 0
    let handle: number | null = null
    const mediaTimes: number[] = []
    const finish = (v: number | null, reason: string) => {
      if (done) return
      done = true
      if (timeoutId) clearTimeout(timeoutId)
      if (handle !== null && typeof anyVideo.cancelVideoFrameCallback === "function") {
        try {
          anyVideo.cancelVideoFrameCallback(handle)
        } catch {}
      }
      thumbLog("[ExplorerThumb] fps:done", { reason, value: v })
      resolve(v)
    }
    const cb = (_now: number, metadata: { mediaTime?: number }) => {
      if (done) return
      if (typeof metadata.mediaTime === "number" && Number.isFinite(metadata.mediaTime)) {
        mediaTimes.push(metadata.mediaTime)
        if (mediaTimes.length >= 2) {
          const dt = mediaTimes[mediaTimes.length - 1] - mediaTimes[mediaTimes.length - 2]
          if (dt > 0.001 && Number.isFinite(dt)) return finish(1 / dt, "mediaTime")
        }
      }
      try {
        handle = anyVideo.requestVideoFrameCallback(cb)
      } catch {
        finish(null, "rvfc-throw")
      }
    }
    timeoutId = setTimeout(() => finish(null, "timeout"), 1200) as unknown as number
    try {
      handle = anyVideo.requestVideoFrameCallback(cb)
    } catch {
      finish(null, "rvfc-throw")
    }
  })
}

async function createVideoThumb(
  blob: Blob,
  hint: { path: string; mimeHint?: string | null },
): Promise<{ thumb: Blob; meta: { durationMs: number; width: number; height: number; frameRate: number | null; hasAudio: boolean | null } | null }> {
  thumbLog("[ExplorerThumb] createVideoThumb:start", {
    path: hint.path,
    mimeHint: hint.mimeHint,
    blobType: blob.type,
    blobSize: blob.size,
  })
  const srcBlob = coerceVideoBlob(blob, hint)
  thumbLog("[ExplorerThumb] createVideoThumb:coerceBlob", {
    srcType: srcBlob.type,
    srcSize: srcBlob.size,
  })
  const url = URL.createObjectURL(srcBlob)
  try {
    const video = document.createElement("video")
    video.muted = true
    video.playsInline = true
    video.preload = "auto"
    video.src = url
    video.addEventListener("error", () => {
      thumbLog("[ExplorerThumb] video:error", { path: hint.path, error: (video as any).error })
    })
    video.load()
    thumbLog("[ExplorerThumb] video:load", { path: hint.path })
    const waitLoadedMetadata = new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve()
      video.onerror = () => reject(new Error("Video metadata load failed"))
    })
    await withTimeout(waitLoadedMetadata, 2500, "loadedmetadata")
    thumbLog("[ExplorerThumb] video:loadedmetadata", {
      path: hint.path,
      duration: video.duration,
      seekableLen: video.seekable?.length ?? null,
      readyState: video.readyState,
    })

    const rawDuration = video.duration
    const metaInfo = resolvePlaybackDuration(rawDuration, getSeekableEnd(video), null)
    thumbLog("[ExplorerThumb] duration:metaInfo", { path: hint.path, metaInfo })
    const recovered = metaInfo.duration > 0 ? metaInfo.duration : await probeVideoDuration(video)
    thumbLog("[ExplorerThumb] duration:recovered", { path: hint.path, recovered })
    const info = resolvePlaybackDuration(rawDuration, getSeekableEnd(video), recovered > 0 ? recovered : null)
    thumbLog("[ExplorerThumb] duration:resolved", { path: hint.path, info })
    const targetTime = info.duration > 0 ? Math.min(1, Math.max(0, info.duration * 0.1)) : 0
    thumbLog("[ExplorerThumb] seek:target", { path: hint.path, targetTime })

    const waitLoadedData = new Promise<void>((resolve, reject) => {
      if (video.readyState >= 2) return resolve()
      const onLoadedData = () => {
        cleanup()
        resolve()
      }
      const onError = () => {
        cleanup()
        reject(new Error("Video data load failed"))
      }
      const cleanup = () => {
        video.removeEventListener("loadeddata", onLoadedData)
        video.removeEventListener("error", onError)
      }
      video.addEventListener("loadeddata", onLoadedData)
      video.addEventListener("error", onError)
    })
    await withTimeout(waitLoadedData, 4000, "loadeddata")
    thumbLog("[ExplorerThumb] video:loadeddata", { path: hint.path, readyState: video.readyState })

    if (targetTime > 0) {
      try {
        const seekOnce = new Promise<void>((resolve, reject) => {
          const onSeeked = () => {
            cleanup()
            resolve()
          }
          const onError = () => {
            cleanup()
            reject(new Error("Video seek failed"))
          }
          const cleanup = () => {
            video.removeEventListener("seeked", onSeeked)
            video.removeEventListener("error", onError)
          }
          video.addEventListener("seeked", onSeeked)
          video.addEventListener("error", onError)
          video.currentTime = targetTime
        })
        await withTimeout(seekOnce, 2500, "seek")
        thumbLog("[ExplorerThumb] seek:done", { path: hint.path, currentTime: video.currentTime })
      } catch {}
    }

    let frameRate: number | null = null
    let hasAudio: boolean | null = null
    try {
      await video.play()
      const fpsPromise = probeFrameRate(video)
      await withTimeout(waitForFrameOrTick(video), 2500, "frame-ready")
      frameRate = await fpsPromise
      hasAudio = detectHasAudio(video)
      video.pause()
      thumbLog("[ExplorerThumb] video:playPause", { path: hint.path })
    } catch (e) {
      thumbLog("[ExplorerThumb] video:playSkip", { path: hint.path, error: e })
    }
    thumbLog("[ExplorerThumb] frame:ready", { path: hint.path, currentTime: video.currentTime })

    const w = Math.max(1, Math.floor(video.videoWidth || 0))
    const h = Math.max(1, Math.floor(video.videoHeight || 0))
    thumbLog("[ExplorerThumb] video:dimensions", { path: hint.path, w, h })
    const maxW = 320
    const scale = w > maxW ? maxW / w : 1
    const outW = Math.max(1, Math.floor(w * scale))
    const outH = Math.max(1, Math.floor(h * scale))
    const canvas = document.createElement("canvas")
    canvas.width = outW
    canvas.height = outH
    const g = canvas.getContext("2d")
    if (!g) throw new Error("Canvas 2D is not available")
    thumbLog("[ExplorerThumb] canvas:drawImage", { path: hint.path, outW, outH })
    g.drawImage(video, 0, 0, outW, outH)
    const thumb = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Thumbnail encode failed"))), "image/webp", 0.82)
    })
    thumbLog("[ExplorerThumb] canvas:encoded", { path: hint.path, thumbType: thumb.type, thumbSize: thumb.size })
    const meta = w > 0 && h > 0 ? { durationMs: info.duration > 0 ? Math.round(info.duration * 1000) : 0, width: w, height: h, frameRate, hasAudio } : null
    thumbLog("[ExplorerThumb] createVideoThumb:done", { path: hint.path, meta })
    return { thumb, meta }
  } finally {
    URL.revokeObjectURL(url)
    thumbLog("[ExplorerThumb] createVideoThumb:cleanup", { path: hint.path })
  }
}

export const ExplorerSurface = defineSurface({
  id: "Explorer.Surface",
  setup: () => {
    let fsPromise: ReturnType<typeof openOpfs> | null = null
    let opSeq = 0
    let initialized = false

    let cwdPrefix: string | null = null
    let entriesAll: OpfsEntryV1[] = []
    let items: ExplorerItem[] = []
    let selected: ExplorerItem | null = null

    let busy = false
    let error: string | null = null

    const viewMode = signal<"list" | "thumbs">("list", { debugLabel: "explorer.viewMode" })
    const address = signal("", { debugLabel: "explorer.address" })
    const history = { stack: [""], index: 0 }

    const thumbById = new Map<string, ThumbState>()
    const thumbQueue: string[] = []
    let thumbWorkerActive = false
    let thumbLastEvent: string | null = null
    const thumbForceRebuild = new Set<string>()

    const ensureFs = async () => {
      if (!fsPromise) fsPromise = openOpfs()
      return await fsPromise
    }

    const setCwd = (next: string | null, pushHistory: boolean) => {
      cwdPrefix = next
      address.set(next ?? "")
      if (pushHistory) {
        const v = next ?? ""
        if (history.stack[history.index] !== v) {
          history.stack = history.stack.slice(0, history.index + 1)
          history.stack.push(v)
          history.index = history.stack.length - 1
        }
      }
      selected = null
    }

    const parseCwdInput = (input: string) => {
      const raw = (input ?? "").trim()
      if (!raw) return null
      return normalizePath(raw)
    }

    const projectItems = (cwd: string | null, all: OpfsEntryV1[]) => {
      const dirs = new Map<string, ExplorerItem>()
      const files: ExplorerItem[] = []
      const prefix = cwd ? normalizePath(cwd).replace(/\/+$/, "") : ""
      const withSlash = prefix ? `${prefix}/` : ""

      for (const e of all) {
        if (prefix) {
          if (!e.path.startsWith(withSlash)) continue
          const rest = e.path.slice(withSlash.length)
          if (!rest) continue
          const seg = rest.split("/")[0]
          if (isHiddenName(seg)) continue
          if (rest.includes("/")) {
            const dirPath = `${prefix}/${seg}`
            if (!dirs.has(dirPath)) dirs.set(dirPath, { kind: "dir", name: seg, path: dirPath })
          } else {
            if (isHiddenName(e.name)) continue
            files.push({ kind: "file", name: e.name, path: e.path, entry: e })
          }
        } else {
          const seg = e.path.split("/")[0]
          if (isHiddenName(seg)) continue
          if (e.path.includes("/")) {
            if (!dirs.has(seg)) dirs.set(seg, { kind: "dir", name: seg, path: seg })
          } else {
            if (isHiddenName(e.name)) continue
            files.push({ kind: "file", name: e.name, path: e.path, entry: e })
          }
        }
      }

      const out: ExplorerItem[] = [...dirs.values(), ...files]
      out.sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === "dir" ? -1 : 1
        return a.name.localeCompare(b.name)
      })
      return out
    }

    const refresh = async () => {
      const seq = ++opSeq
      busy = true
      error = null
      invalidateAll()
      try {
        const fs = await ensureFs()
        const nextEntries = await fs.list(cwdPrefix ?? undefined)
        if (seq !== opSeq) return
        entriesAll = nextEntries
        items = projectItems(cwdPrefix, entriesAll)
        if (selected) {
          const still = items.find((i) => i.kind === selected!.kind && i.path === selected!.path) ?? null
          selected = still
        }
      } catch (e) {
        if (seq !== opSeq) return
        error = e instanceof Error ? e.message : String(e)
      } finally {
        if (seq !== opSeq) return
        busy = false
        invalidateAll()
      }
    }

    const navigateToAddress = async () => {
      const seq = ++opSeq
      busy = true
      error = null
      invalidateAll()
      try {
        const next = parseCwdInput(address.get())
        if (seq !== opSeq) return
        setCwd(next, true)
        await refresh()
      } catch (e) {
        if (seq !== opSeq) return
        error = e instanceof Error ? e.message : String(e)
      } finally {
        if (seq !== opSeq) return
        busy = false
        invalidateAll()
      }
    }

    const goUp = async () => {
      if (!cwdPrefix) return
      const parent = dirName(cwdPrefix)
      setCwd(parent ? parent : null, true)
      await refresh()
    }

    const goBack = async () => {
      if (history.index <= 0) return
      history.index -= 1
      const v = history.stack[history.index] ?? ""
      setCwd(v ? v : null, false)
      await refresh()
    }

    const goForward = async () => {
      if (history.index >= history.stack.length - 1) return
      history.index += 1
      const v = history.stack[history.index] ?? ""
      setCwd(v ? v : null, false)
      await refresh()
    }

    const enterSelectedDir = async () => {
      if (!selected || selected.kind !== "dir") return
      setCwd(selected.path, true)
      await refresh()
    }

    const importFiles = async () => {
      const files = await pickFiles({ multiple: true, accept: `${buildAcceptString("video")},${buildAcceptString("audio")},${buildAcceptString("image")}`, inputId: "tnl-explorer-file-input" })
      if (!files.length) return
      const seq = ++opSeq
      busy = true
      error = null
      invalidateAll()
      try {
        const fs = await ensureFs()
        for (const file of files) {
          const target = cwdPrefix ? `${cwdPrefix}/${file.name}` : file.name
          await fs.writeFile(target, file, { type: file.type || "application/octet-stream" })
        }
        if (seq !== opSeq) return
        await refresh()
      } catch (e) {
        if (seq !== opSeq) return
        error = e instanceof Error ? e.message : String(e)
      } finally {
        if (seq !== opSeq) return
        busy = false
        invalidateAll()
      }
    }

    const exportSelected = async () => {
      if (!selected || selected.kind !== "file") return
      const seq = ++opSeq
      busy = true
      error = null
      invalidateAll()
      try {
        const fs = await ensureFs()
        const blob = await fs.readFile(selected.path)
        if (seq !== opSeq) return
        downloadBlob(blob, baseName(selected.path))
      } catch (e) {
        if (seq !== opSeq) return
        error = e instanceof Error ? e.message : String(e)
      } finally {
        if (seq !== opSeq) return
        busy = false
        invalidateAll()
      }
    }

    const deleteSelected = async () => {
      if (!selected || selected.kind !== "file") return
      if (!showConfirm(`Delete ${selected.path}?`)) return
      const seq = ++opSeq
      busy = true
      error = null
      invalidateAll()
      try {
        const fs = await ensureFs()
        await fs.delete(selected.path)
        if (seq !== opSeq) return
        selected = null
        await refresh()
      } catch (e) {
        if (seq !== opSeq) return
        error = e instanceof Error ? e.message : String(e)
      } finally {
        if (seq !== opSeq) return
        busy = false
        invalidateAll()
      }
    }

    const renameSelected = async () => {
      if (!selected || selected.kind !== "file") return
      const prevName = baseName(selected.path)
      const nextName = showPrompt("Rename to", prevName)
      if (nextName === null) return
      const name = nextName.trim()
      if (!name) return
      const dir = dirName(selected.path)
      const nextPath = dir ? `${dir}/${name}` : name
      const seq = ++opSeq
      busy = true
      error = null
      invalidateAll()
      try {
        const fs = await ensureFs()
        await fs.move(selected.path, nextPath)
        if (seq !== opSeq) return
        selected = null
        await refresh()
      } catch (e) {
        if (seq !== opSeq) return
        error = e instanceof Error ? e.message : String(e)
      } finally {
        if (seq !== opSeq) return
        busy = false
        invalidateAll()
      }
    }

    const ensureThumbState = (id: string) => {
      if (!thumbById.has(id)) thumbById.set(id, { state: "idle" })
      return thumbById.get(id)!
    }

    const enqueueThumb = (entry: OpfsEntryV1) => {
      const id = entry.id
      const st = ensureThumbState(id)
      if (st.state === "loading" || st.state === "ready" || st.state === "error") return
      if (thumbQueue.includes(id)) return
      thumbQueue.push(id)
      thumbLastEvent = `enqueue:${id}`
      thumbLog("[ExplorerThumb] enqueue", { id, path: entry.path, type: entry.type, size: entry.size })
      void runThumbWorker()
    }

    const retryThumb = (entry: OpfsEntryV1, opts?: { force?: boolean }) => {
      const id = entry.id
      thumbLog("[ExplorerThumb] retry:click", { id, path: entry.path, type: entry.type, size: entry.size })
      if (opts?.force) thumbForceRebuild.add(id)
      thumbById.set(id, { state: "idle" })
      if (!thumbQueue.includes(id)) thumbQueue.push(id)
      thumbLastEvent = `retry:${id}`
      void runThumbWorker()
      invalidateAll()
    }

    const runThumbWorker = async () => {
      if (thumbWorkerActive) return
      thumbWorkerActive = true
      thumbLastEvent = "worker:start"
      thumbLog("[ExplorerThumb] worker:start", { queued: thumbQueue.length })
      try {
        while (thumbQueue.length) {
          const id = thumbQueue.shift()!
          const entry = entriesAll.find((e) => e.id === id)
          if (!entry) {
            thumbLog("[ExplorerThumb] worker:missingEntry", { id })
            continue
          }
          thumbById.set(id, { state: "loading" })
          thumbLastEvent = `build:${id}`
          invalidateAll()
          try {
            const fs = await ensureFs()
            thumbLog("[ExplorerThumb] worker:fsReady", { id, path: entry.path })
            const force = thumbForceRebuild.delete(id)
            if (force) thumbLog("[ExplorerThumb] worker:forceRebuild", { id, path: entry.path })
            const extras = isStringRecord(entry.extras) ? entry.extras : {}
            const rawThumbPath = extras["thumbPath"]
            const thumbPath = typeof rawThumbPath === "string" && rawThumbPath.length ? rawThumbPath : null
            let thumbBlob: Blob | null = null
            let meta: { durationMs: number; width: number; height: number; frameRate: number | null; hasAudio: boolean | null } | null = null
            if (thumbPath && !force) {
              try {
                thumbLog("[ExplorerThumb] worker:readCached", { id, thumbPath })
                thumbBlob = await fs.readFile(thumbPath)
                if (thumbBlob && thumbBlob.size < 1024) {
                  thumbLog("[ExplorerThumb] worker:cachedTooSmall", { id, thumbPath, size: thumbBlob.size })
                  thumbBlob = null
                }
              } catch {
                thumbLog("[ExplorerThumb] worker:readCachedMiss", { id, thumbPath })
                thumbBlob = null
              }
            }
            if (!thumbBlob) {
              thumbLog("[ExplorerThumb] worker:readSource", { id, path: entry.path })
              const src = await fs.readFile(entry.path)
              thumbLog("[ExplorerThumb] worker:sourceRead", { id, srcType: src.type, srcSize: src.size })
              const created = await createVideoThumb(src, { path: entry.path, mimeHint: entry.type })
              thumbBlob = created.thumb
              meta = created.meta
              const cachePath = `.tnl-cache/thumbs/${entry.id}.webp`
              const nextExtrasBase: Record<string, unknown> = { ...extras }
              if (meta) nextExtrasBase.videoMeta = meta
              entry.extras = nextExtrasBase as any
              try {
                thumbLog("[ExplorerThumb] worker:writeCache", { id, cachePath, thumbSize: thumbBlob.size, thumbType: thumbBlob.type })
                await fs.writeFile(cachePath, thumbBlob, { type: "image/webp" })
                const nextExtras: Record<string, unknown> = { ...nextExtrasBase, thumbPath: cachePath, thumbUpdatedAt: Date.now() }
                entry.extras = nextExtras as any
                try {
                  thumbLog("[ExplorerThumb] worker:updateMeta", { id, path: entry.path, cachePath, meta })
                  await fs.updateMeta(entry.path, { extras: nextExtras })
                } catch (e) {
                  thumbLog("[ExplorerThumb] worker:updateMetaError", { id, path: entry.path, error: e })
                }
              } catch (e) {
                thumbLog("[ExplorerThumb] worker:writeCacheError", { id, cachePath, error: e })
              }
            }
            thumbLog("[ExplorerThumb] worker:loadImage", { id, thumbType: thumbBlob.type, thumbSize: thumbBlob.size })
            const loaded = await loadImageFromBlob(thumbBlob)
            const prev = thumbById.get(id)
            if (prev && prev.state === "ready") URL.revokeObjectURL(prev.url)
            thumbById.set(id, { state: "ready", img: loaded.img, url: loaded.url })
            thumbLastEvent = `ready:${id}`
            thumbLog("[ExplorerThumb] worker:ready", { id })
          } catch (e) {
            thumbById.set(id, { state: "error", error: e instanceof Error ? e.message : String(e) })
            thumbLastEvent = `error:${id}`
            thumbLog("[ExplorerThumb] worker:error", { id, error: e })
          } finally {
            invalidateAll()
          }
        }
      } finally {
        thumbWorkerActive = false
        thumbLastEvent = "worker:idle"
        thumbLog("[ExplorerThumb] worker:idle")
      }
    }

    return () => {
      if (!initialized) {
        initialized = true
        void refresh()
      }

      const thumbStatusText = viewMode.get() === "thumbs" ? ` · thumbs ${thumbWorkerActive ? "busy" : "idle"} · q${thumbQueue.length}` : ""
      const debugThumbText = thumbLastEvent ? ` · ${thumbLastEvent}` : ""
      const statusText = busy ? "Working..." : error ? error : `${items.length} items${thumbStatusText}${debugThumbText}`
      const statusColor = error ? theme.colors.dangerText : theme.colors.textMuted
      const cwdMeta = cwdPrefix ? cwdPrefix : "opfs:/"
      const canBack = history.index > 0
      const canForward = history.index < history.stack.length - 1

      const selectedIsFile = selected?.kind === "file"
      const selectedIsDir = selected?.kind === "dir"

      const breadcrumbParts = cwdPrefix ? cwdPrefix.split("/").filter((p) => p.length) : []
      const breadcrumbNodes = [
        <Button
          key="explorer.bc.root"
          text="opfs:/"
          title="Root"
          style={{ fixed: 64 }}
          onClick={() => {
            setCwd(null, true)
            void refresh()
          }}
        />,
        ...breadcrumbParts.map((seg, idx) => {
          const path = breadcrumbParts.slice(0, idx + 1).join("/")
          return (
            <Button
              key={`explorer.bc.${path}`}
              text={seg}
              title={path}
              style={{ fixed: 90 }}
              onClick={() => {
                setCwd(path, true)
                void refresh()
              }}
            />
          )
        }),
      ]

      const content =
        viewMode.get() === "list" ? (
          <VStack key="explorer.list" style={{ axis: "column", gap: 0, padding: { l: 2, t: 2, r: 14, b: 2 }, w: "auto", h: "auto" }}>
            {items.map((item) => {
              if (item.kind === "dir") {
                return (
                  <ListRow
                    key={`explorer.row.dir.${item.path}`}
                    leftText={`▸ ${item.name}`}
                    rightText="Directory"
                    variant="item"
                    selected={selected?.kind === "dir" && selected.path === item.path}
                    onClick={() => {
                      selected = item
                      invalidateAll()
                    }}
                  />
                )
              }
              const e = item.entry
              return (
                <ListRow
                  key={`explorer.row.file.${e.path}`}
                  leftText={item.name}
                  rightText={`${formatBytes(e.size)} · ${e.type}`}
                  variant="item"
                  selected={selected?.kind === "file" && selected.path === e.path}
                  onClick={() => {
                    selected = item
                    invalidateAll()
                  }}
                />
              )
            })}
          </VStack>
        ) : (
          <VStack key="explorer.thumbs" style={{ axis: "column", gap: 8, padding: { l: 6, t: 6, r: 14, b: 6 }, w: "auto", h: "auto" }}>
            {(() => {
              const files = items.filter((i) => i.kind === "file") as Extract<ExplorerItem, { kind: "file" }>[]
              const cols = 4
              const rows: Extract<ExplorerItem, { kind: "file" }>[][] = []
              for (let i = 0; i < files.length; i += cols) rows.push(files.slice(i, i + cols))
              const eager = files.slice(0, 24)
              for (const item of eager) if (isVideoEntry(item.entry)) enqueueThumb(item.entry)
              return rows.map((row, ridx) => (
                <HStack key={`explorer.thumb.row.${ridx}`} style={{ axis: "row", gap: 8, w: "auto", h: "auto" }}>
                  {row.map((item) => {
                    const e = item.entry
                    const isSelected = selected?.kind === "file" && selected.path === e.path
                    const st = ensureThumbState(e.id)
                    const img = st.state === "ready" ? st.img : null
                    const thumbError = st.state === "error" ? st.error : null
                    return (
                      <Stack
                        key={`explorer.thumb.${e.path}`}
                        style={{ fixed: 168, padding: 6, w: "auto", h: "auto" }}
                        box={{
                          fill: isSelected ? theme.colors.selectionFill : theme.colors.white02,
                          stroke: isSelected ? theme.colors.selectionStroke : theme.colors.white08,
                          radius: 8,
                        }}
                      >
                        <VStack key={`explorer.thumb.inner.${e.id}`} style={{ axis: "column", gap: 6, w: "auto", h: "auto" }}>
                          <Paint
                            key={`explorer.thumb.paint.${e.id}`}
                            measure={(max) => ({ w: Math.min(156, max.w), h: 88 })}
                            draw={(ctx, rect) => {
                              ctx.save()
                              ctx.fillStyle = theme.colors.black22
                              ctx.fillRect(rect.x, rect.y, rect.w, rect.h)
                              if (img) {
                                const iw = img.naturalWidth || 1
                                const ih = img.naturalHeight || 1
                                const s = Math.max(rect.w / iw, rect.h / ih)
                                const dw = iw * s
                                const dh = ih * s
                                const dx = rect.x + (rect.w - dw) / 2
                                const dy = rect.y + (rect.h - dh) / 2
                                ctx.drawImage(img, dx, dy, dw, dh)
                              } else {
                                ctx.fillStyle = theme.colors.textMuted
                                ctx.font = `600 12px ${theme.typography.family}`
                                ctx.textAlign = "center"
                                ctx.textBaseline = "middle"
                                ctx.fillText(thumbError ? "ERR" : isVideoEntry(e) ? "VIDEO" : "FILE", rect.x + rect.w / 2, rect.y + rect.h / 2)
                              }
                              ctx.restore()
                            }}
                          />
                          <Text key={`explorer.thumb.name.${e.id}`} weight="bold">
                            {e.name}
                          </Text>
                          <Text key={`explorer.thumb.meta.${e.id}`} tone="muted" size="meta">
                            {formatBytes(e.size)}
                          </Text>
                        </VStack>
                        <ClickArea
                          key={`explorer.thumb.click.${e.id}`}
                          style={{ fill: true }}
                          onClick={() => {
                            selected = item
                            invalidateAll()
                          }}
                        />
                      </Stack>
                    )
                  })}
                  {row.length < cols ? Array.from({ length: cols - row.length }).map((_, i) => <Spacer key={`explorer.thumb.pad.${ridx}.${i}`} style={{ fixed: 168 }} />) : null}
                </HStack>
              ))
            })()}
          </VStack>
        )

      const details = (() => {
        if (!selected) {
          return (
            <VStack key="explorer.details.empty" style={{ axis: "column", gap: 8, padding: 10, w: "auto", h: "auto" }}>
              <Text tone="muted">No selection</Text>
            </VStack>
          )
        }
        if (selected.kind === "dir") {
          return (
            <VStack key="explorer.details.dir" style={{ axis: "column", gap: 8, padding: 10, w: "auto", h: "auto" }}>
              <Text weight="bold">{selected.name}</Text>
              <Text tone="muted" size="meta">{selected.path}</Text>
              <Button text="Open" title="Open folder" style={{ fixed: 120 }} onClick={() => void enterSelectedDir()} />
            </VStack>
          )
        }
        const e = selected.entry
        const st = ensureThumbState(e.id)
        const img = st.state === "ready" ? st.img : null
        const thumbError = st.state === "error" ? st.error : null
        const extras = isStringRecord(e.extras) ? e.extras : null
        const videoMeta = extras && isStringRecord(extras.videoMeta) ? (extras.videoMeta as any) : null
        const durationText =
          videoMeta && typeof videoMeta.durationMs === "number" && Number.isFinite(videoMeta.durationMs)
            ? `${(videoMeta.durationMs / 1000).toFixed(2)}s`
            : "-"
        const dimsText =
          videoMeta && typeof videoMeta.width === "number" && typeof videoMeta.height === "number"
            ? `${videoMeta.width}×${videoMeta.height}`
            : "-"
        const fpsText =
          videoMeta && typeof videoMeta.frameRate === "number" && Number.isFinite(videoMeta.frameRate)
            ? `${videoMeta.frameRate.toFixed(videoMeta.frameRate < 10 ? 2 : videoMeta.frameRate < 100 ? 1 : 0)} fps`
            : "-"
        const audioText =
          videoMeta && typeof videoMeta.hasAudio === "boolean"
            ? videoMeta.hasAudio ? "yes" : "no"
            : "-"
        return (
          <VStack key="explorer.details.file" style={{ axis: "column", gap: 10, padding: 10, w: "auto", h: "auto" }}>
            <Paint
              key="explorer.details.preview"
              measure={(max) => ({ w: Math.min(240, max.w), h: 120 })}
              draw={(ctx, rect) => {
                ctx.save()
                ctx.fillStyle = theme.colors.black22
                ctx.fillRect(rect.x, rect.y, rect.w, rect.h)
                if (img) {
                  const iw = img.naturalWidth || 1
                  const ih = img.naturalHeight || 1
                  const s = Math.max(rect.w / iw, rect.h / ih)
                  const dw = iw * s
                  const dh = ih * s
                  const dx = rect.x + (rect.w - dw) / 2
                  const dy = rect.y + (rect.h - dh) / 2
                  ctx.drawImage(img, dx, dy, dw, dh)
                } else {
                  ctx.fillStyle = theme.colors.textMuted
                  ctx.font = `600 12px ${theme.typography.family}`
                  ctx.textAlign = "center"
                  ctx.textBaseline = "middle"
                  ctx.fillText(thumbError ? "ERR" : isVideoEntry(e) ? "VIDEO" : "FILE", rect.x + rect.w / 2, rect.y + rect.h / 2)
                }
                ctx.restore()
              }}
            />
            {thumbError ? (
              <VStack style={{ axis: "column", gap: 6, w: "auto", h: "auto" }}>
                <Text tone="muted" size="meta">{thumbError}</Text>
                <Button text="Retry Thumb" title="Retry thumbnail" style={{ fixed: 120 }} onClick={() => retryThumb(e, { force: true })} />
              </VStack>
            ) : st.state === "loading" ? (
              <Text tone="muted" size="meta">Building thumbnail...</Text>
            ) : isVideoEntry(e) && st.state !== "ready" ? (
              <Button text="Build Thumb" title="Build thumbnail" style={{ fixed: 120 }} onClick={() => retryThumb(e, { force: true })} />
            ) : null}
            <VStack style={{ axis: "column", gap: 4, w: "auto", h: "auto" }}>
              <Text weight="bold">{e.name}</Text>
              <Text tone="muted" size="meta">{e.path}</Text>
            </VStack>
            <VStack style={{ axis: "column", gap: 4, w: "auto", h: "auto" }}>
              <Text size="meta" tone="muted">{`Type: ${e.type}`}</Text>
              <Text size="meta" tone="muted">{`Size: ${formatBytes(e.size)}`}</Text>
              <Text size="meta" tone="muted">{`Created: ${formatLocalTime(e.createdAt)}`}</Text>
              <Text size="meta" tone="muted">{`Updated: ${formatLocalTime(e.updatedAt)}`}</Text>
              {isVideoEntry(e) ? (
                <Fragment>
                  <Text size="meta" tone="muted">{`Duration: ${durationText}`}</Text>
                  <Text size="meta" tone="muted">{`Video: ${dimsText}`}</Text>
                  <Text size="meta" tone="muted">{`FPS: ${fpsText}`}</Text>
                  <Text size="meta" tone="muted">{`Audio: ${audioText}`}</Text>
                </Fragment>
              ) : null}
            </VStack>
          </VStack>
        )
      })()

      return (
        <PanelColumn>
          <PanelHeader key="explorer.header" title="Explorer" meta={cwdMeta}>
            <Text tone="muted" size="meta" color={statusColor}>
              {statusText}
            </Text>
          </PanelHeader>
          <PanelToolbar key="explorer.address" style={{ gap: theme.spacing.xs }}>
            <Button text="←" title="Back" style={{ fixed: 32 }} disabled={!canBack || busy} onClick={() => void goBack()} />
            <Button text="→" title="Forward" style={{ fixed: 32 }} disabled={!canForward || busy} onClick={() => void goForward()} />
            <Button text="↑" title="Up" style={{ fixed: 32 }} disabled={!cwdPrefix || busy} onClick={() => void goUp()} />
            <TextBox value={address} placeholder="path (empty = root)" style={{ fill: true }} disabled={busy} />
            <Button text="Go" title="Go" style={{ fixed: 44 }} disabled={busy} onClick={() => void navigateToAddress()} />
            <Spacer style={{ fixed: theme.spacing.xs }} />
            <Button
              text="List"
              title="List view"
              style={{ fixed: 52 }}
              disabled={busy || viewMode.get() === "list"}
              onClick={() => {
                viewMode.set("list")
                invalidateAll()
              }}
            />
            <Button
              text="Thumb"
              title="Thumbnail view"
              style={{ fixed: 64 }}
              disabled={busy || viewMode.get() === "thumbs"}
              onClick={() => {
                viewMode.set("thumbs")
                invalidateAll()
              }}
            />
          </PanelToolbar>
          <PanelToolbar key="explorer.breadcrumb" style={{ gap: theme.spacing.xs }}>
            {breadcrumbNodes}
          </PanelToolbar>
          <PanelActionRow
            key="explorer.actions"
            compact
            actions={[
              { key: "refresh", icon: "R", text: busy ? "Refreshing" : "Refresh", title: busy ? "Refreshing" : "Refresh", onClick: () => void refresh(), disabled: busy },
              { key: "open", icon: "O", text: "Open", title: "Open folder", onClick: () => void enterSelectedDir(), disabled: busy || !selectedIsDir },
              { key: "import", icon: "I", text: "Import", title: "Import files", onClick: () => void importFiles(), disabled: busy },
              { key: "export", icon: "E", text: "Export", title: "Export selected", onClick: () => void exportSelected(), disabled: busy || !selectedIsFile },
              { key: "rename", icon: "N", text: "Rename", title: "Rename selected", onClick: () => void renameSelected(), disabled: busy || !selectedIsFile },
              { key: "delete", icon: "X", text: "Delete", title: "Delete selected", onClick: () => void deleteSelected(), disabled: busy || !selectedIsFile },
            ]}
          />
          <HStack key="explorer.body" style={{ axis: "row", gap: theme.spacing.sm, fill: true, w: "auto", h: "auto" }}>
            <PanelScroll key="explorer.content">{content}</PanelScroll>
            <VStack
              key="explorer.details"
              style={{ axis: "column", gap: 0, fixed: 280, w: "auto", h: "auto" }}
              box={{ fill: theme.colors.white02, stroke: theme.colors.white08, radius: 10 }}
            >
              {details}
            </VStack>
          </HStack>
        </PanelColumn>
      )
    }
  },
})
