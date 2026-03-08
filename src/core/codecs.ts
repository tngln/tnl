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

export type CodecRuntimeRegistry = ReturnType<typeof createCodecRegistry>

export function createCodecRegistry() {
  const entries = new Map<string, CodecRuntimeEntry>()

  return {
    register(entry: CodecRuntimeEntry) {
      entries.set(entry.id, { ...entry })
    },
    update(id: string, patch: Partial<Omit<CodecRuntimeEntry, "id">>) {
      const current = entries.get(id)
      if (!current) return
      entries.set(id, { ...current, ...patch, id })
    },
    unregister(id: string) {
      entries.delete(id)
    },
    list() {
      return [...entries.values()].sort((a, b) => {
        if (a.kind !== b.kind) return a.kind.localeCompare(b.kind)
        return a.label.localeCompare(b.label)
      })
    },
    summary() {
      const list = this.list()
      return {
        total: list.length,
        byKind: {
          videoDecoders: list.filter((e) => e.kind === "video-decoder").length,
          videoEncoders: list.filter((e) => e.kind === "video-encoder").length,
          audioDecoders: list.filter((e) => e.kind === "audio-decoder").length,
          audioEncoders: list.filter((e) => e.kind === "audio-encoder").length,
        },
      }
    },
  }
}
