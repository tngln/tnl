import type { AssetId, AssetRepresentation, ProxySpec } from "./types"

export type EnsureProxyResult =
  | { status: "ready"; representation: Extract<AssetRepresentation, { kind: "proxy" }> }
  | { status: "pending" }

export interface ProxyManager {
  ensureProxy(assetId: AssetId, spec: ProxySpec): Promise<EnsureProxyResult>
}

// v1 scaffold: callers can depend on the interface today without forcing proxy generation to exist yet.
export class NullProxyManager implements ProxyManager {
  async ensureProxy(_assetId: AssetId, _spec: ProxySpec): Promise<EnsureProxyResult> {
    return { status: "pending" }
  }
}

