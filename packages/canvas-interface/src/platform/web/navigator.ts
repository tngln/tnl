export type UserAgentDataLike = {
  platform?: string
  mobile?: boolean
  brands?: Array<{ brand: string; version: string }>
}

export type WebNavigatorInfo = {
  userAgent: string
  platform: string
  brands: string
  language: string
  languages: string[]
  mobile: boolean | null
  online: boolean
  deviceMemory: number | null
  hardwareConcurrency: number | null
  maxTouchPoints: number | null
}

export type WebRuntimeFlags = {
  secureContext: boolean
  crossOriginIsolated: boolean
  sharedArrayBuffer: boolean
  worker: boolean
  offscreenCanvas: boolean
  mediaCapabilities: boolean
  videoFrame: boolean
  encodedVideoChunk: boolean
  encodedAudioChunk: boolean
  videoDecoder: boolean
  videoEncoder: boolean
  audioDecoder: boolean
  audioEncoder: boolean
}

export function getWebNavigatorInfo(): WebNavigatorInfo {
  const nav = navigator as Navigator & { userAgentData?: UserAgentDataLike; deviceMemory?: number }
  const brands = nav.userAgentData?.brands?.map((entry) => `${entry.brand} ${entry.version}`).join(", ") ?? "-"
  return {
    userAgent: nav.userAgent,
    platform: nav.userAgentData?.platform ?? nav.platform,
    brands,
    language: nav.language,
    languages: nav.languages ? [...nav.languages] : [],
    mobile: nav.userAgentData?.mobile ?? null,
    online: nav.onLine,
    deviceMemory: nav.deviceMemory ?? null,
    hardwareConcurrency: nav.hardwareConcurrency ?? null,
    maxTouchPoints: typeof nav.maxTouchPoints === "number" ? nav.maxTouchPoints : null,
  }
}

export function getWebRuntimeFlags(): WebRuntimeFlags {
  const g = globalThis as any
  return {
    secureContext: Boolean(g.isSecureContext),
    crossOriginIsolated: Boolean(g.crossOriginIsolated),
    sharedArrayBuffer: typeof g.SharedArrayBuffer !== "undefined",
    worker: typeof g.Worker !== "undefined",
    offscreenCanvas: typeof g.OffscreenCanvas !== "undefined",
    mediaCapabilities: typeof navigator !== "undefined" && typeof navigator.mediaCapabilities !== "undefined",
    videoFrame: typeof g.VideoFrame !== "undefined",
    encodedVideoChunk: typeof g.EncodedVideoChunk !== "undefined",
    encodedAudioChunk: typeof g.EncodedAudioChunk !== "undefined",
    videoDecoder: typeof g.VideoDecoder !== "undefined",
    videoEncoder: typeof g.VideoEncoder !== "undefined",
    audioDecoder: typeof g.AudioDecoder !== "undefined",
    audioEncoder: typeof g.AudioEncoder !== "undefined",
  }
}
