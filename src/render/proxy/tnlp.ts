import type { ProxySpec } from "./types"

export type TnlpHeaderV1 = {
  format: "tnlp"
  version: 1
  codec: string
  codedWidth: number
  codedHeight: number
  fps: number
  // v1: keep index/config opaque until encoding is implemented.
  decoderConfig?: Record<string, unknown>
  keyframes?: Array<{ frame: number; byteOffset: number }>
}

export function headerFromSpec(spec: ProxySpec): TnlpHeaderV1 {
  return {
    format: "tnlp",
    version: 1,
    codec: spec.codec,
    codedWidth: spec.w,
    codedHeight: spec.h,
    fps: spec.fps,
  }
}

export function encodeTnlpHeader(header: TnlpHeaderV1): Uint8Array {
  const json = JSON.stringify(header)
  return new TextEncoder().encode(json)
}

export function decodeTnlpHeader(bytes: Uint8Array): TnlpHeaderV1 {
  const json = new TextDecoder().decode(bytes)
  const parsed = JSON.parse(json) as TnlpHeaderV1
  if (parsed.format !== "tnlp" || parsed.version !== 1) throw new Error("Unsupported TNLP header")
  return parsed
}

