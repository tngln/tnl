export type AssetId = string

export type RepresentationKind = "original" | "proxy"

export type ProxySpec = {
  w: number
  h: number
  fps: number
  codec: string
  bitrate?: number
}

export type AssetRepresentation =
  | { kind: "original"; path: string }
  | { kind: "proxy"; path: string; spec: ProxySpec }

