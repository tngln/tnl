export type WebCodecProbeKind = "video-decoder" | "video-encoder" | "audio-decoder" | "audio-encoder"

type ConfigSupportResult = {
  supported: boolean
  config?: unknown
}

function getCodecConstructor(kind: WebCodecProbeKind) {
  const g = globalThis as any
  if (kind === "video-decoder") return g.VideoDecoder
  if (kind === "video-encoder") return g.VideoEncoder
  if (kind === "audio-decoder") return g.AudioDecoder
  return g.AudioEncoder
}

export function hasWebCodecApis() {
  return {
    videoDecoder: Boolean(getCodecConstructor("video-decoder")),
    videoEncoder: Boolean(getCodecConstructor("video-encoder")),
    audioDecoder: Boolean(getCodecConstructor("audio-decoder")),
    audioEncoder: Boolean(getCodecConstructor("audio-encoder")),
  }
}

export async function probeCodecConfig(kind: WebCodecProbeKind, config: Record<string, unknown>) {
  const ctor = getCodecConstructor(kind)
  if (!ctor || typeof ctor.isConfigSupported !== "function") {
    return { available: false, supported: false, detail: "API unavailable" as const }
  }
  try {
    const support = (await ctor.isConfigSupported(config)) as ConfigSupportResult | undefined
    const normalized = support?.config
    const hardwareAcceleration =
      normalized && typeof normalized === "object" && "hardwareAcceleration" in (normalized as Record<string, unknown>)
        ? ((normalized as Record<string, unknown>).hardwareAcceleration as string | undefined)
        : undefined
    return {
      available: true,
      supported: Boolean(support?.supported),
      detail: Boolean(support?.supported) ? "Supported" : "Unsupported",
      hardwareAcceleration,
      config: normalized,
    }
  } catch (error) {
    return {
      available: true,
      supported: false,
      detail: error instanceof Error ? error.message : String(error),
      error,
    }
  }
}
