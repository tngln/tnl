export type MediaKind = "video" | "audio" | "image"

export type MediaContainer =
  | "webm"
  | "mp4"
  | "mov"
  | "m4v"
  | "avi"
  | "jpg"
  | "jpeg"
  | "png"
  | "bmp"
  | "webp"
  | "mp3"
  | "wav"
  | "aac"
  | "opus"
  | "vorbis"
  | "ogg"
  | "unknown"

export function inferContainerFromPath(path: string | null): MediaContainer {
  if (!path) return "unknown"
  const lower = path.toLowerCase()
  if (lower.endsWith(".webm")) return "webm"
  if (lower.endsWith(".mp4")) return "mp4"
  if (lower.endsWith(".mov")) return "mov"
  if (lower.endsWith(".m4v")) return "m4v"
  if (lower.endsWith(".avi")) return "avi"
  if (lower.endsWith(".jpg")) return "jpg"
  if (lower.endsWith(".jpeg")) return "jpeg"
  if (lower.endsWith(".png")) return "png"
  if (lower.endsWith(".bmp")) return "bmp"
  if (lower.endsWith(".webp")) return "webp"
  if (lower.endsWith(".mp3")) return "mp3"
  if (lower.endsWith(".wav")) return "wav"
  if (lower.endsWith(".aac")) return "aac"
  if (lower.endsWith(".opus")) return "opus"
  if (lower.endsWith(".ogg")) return "ogg"
  return "unknown"
}

export function inferMimeCandidates(path: string | null, blobType?: string | null): string[] {
  const out: string[] = []
  const push = (t: string) => {
    const normalized = t.trim()
    if (!normalized) return
    if (!out.includes(normalized)) out.push(normalized)
  }

  const type = blobType?.trim()
  if (type && type !== "application/octet-stream") push(type)

  const c = inferContainerFromPath(path)
  if (c === "webm") push("video/webm")
  if (c === "mp4" || c === "m4v") push("video/mp4")
  if (c === "mov") push("video/quicktime")
  if (c === "avi") {
    push("video/x-msvideo")
    push("video/avi")
  }
  if (c === "jpg" || c === "jpeg") push("image/jpeg")
  if (c === "png") push("image/png")
  if (c === "bmp") push("image/bmp")
  if (c === "webp") push("image/webp")
  if (c === "mp3") push("audio/mpeg")
  if (c === "wav") {
    push("audio/wav")
    push("audio/wave")
    push("audio/x-wav")
  }
  if (c === "aac") push("audio/aac")
  if (c === "opus") {
    push("audio/opus")
    push("audio/webm; codecs=opus")
    push("audio/ogg; codecs=opus")
  }
  if (c === "vorbis" || c === "ogg") {
    push("audio/ogg")
    push("audio/ogg; codecs=vorbis")
  }

  return out
}

export function buildAcceptString(kind: MediaKind): string {
  if (kind === "video") return "video/*,.webm,.mp4,.m4v,.mov,.avi"
  if (kind === "audio") return "audio/*,.aac,.mp3,.wav,.opus,.ogg"
  return "image/*,.jpg,.jpeg,.png,.bmp,.webp"
}

export function isAviPath(path: string | null) {
  return inferContainerFromPath(path) === "avi"
}

