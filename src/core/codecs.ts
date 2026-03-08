export type CodecRuntimeKind = "video-decoder" | "video-encoder" | "audio-decoder" | "audio-encoder"

export type CodecRuntimeStatus = "created" | "configured" | "running" | "flushed" | "closed" | "error"

export type CodecRuntimeEntry = {
  id: string
  label: string
  kind: CodecRuntimeKind
  codec: string
  status: CodecRuntimeStatus
  queueSize?: number
  hardwareAcceleration?: string
  detail?: string
}

export class CodecRuntimeRegistry {
  private readonly entries = new Map<string, CodecRuntimeEntry>()

  register(entry: CodecRuntimeEntry) {
    this.entries.set(entry.id, { ...entry })
  }

  update(id: string, patch: Partial<Omit<CodecRuntimeEntry, "id">>) {
    const current = this.entries.get(id)
    if (!current) return
    this.entries.set(id, { ...current, ...patch, id })
  }

  unregister(id: string) {
    this.entries.delete(id)
  }

  list() {
    return [...this.entries.values()].sort((a, b) => {
      if (a.kind !== b.kind) return a.kind.localeCompare(b.kind)
      return a.label.localeCompare(b.label)
    })
  }

  summary() {
    const list = this.list()
    return {
      total: list.length,
      byKind: {
        videoDecoders: list.filter((entry) => entry.kind === "video-decoder").length,
        videoEncoders: list.filter((entry) => entry.kind === "video-encoder").length,
        audioDecoders: list.filter((entry) => entry.kind === "audio-decoder").length,
        audioEncoders: list.filter((entry) => entry.kind === "audio-encoder").length,
      },
    }
  }
}
