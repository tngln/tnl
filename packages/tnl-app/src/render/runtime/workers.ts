export type WorkerRuntimeStatus = "running" | "stopped" | "error"

export type WorkerRuntimeMetrics = {
  pending?: number
  inFlight?: number
  queued?: number
  completed?: number
  canceled?: number
  lastError?: string
}

export type WorkerRuntimeEntry = {
  id: string
  name: string
  kind: string
  createdAt: number
  status: WorkerRuntimeStatus
  lastMessageAt?: number
  metrics?: WorkerRuntimeMetrics
}

export type WorkerRuntimeRegistry = ReturnType<typeof createWorkerRegistry>

export function createWorkerRegistry() {
  const entries = new Map<string, WorkerRuntimeEntry>()

  return {
    register(entry: WorkerRuntimeEntry) {
      entries.set(entry.id, { ...entry, metrics: entry.metrics ? { ...entry.metrics } : undefined })
    },
    update(id: string, patch: Partial<Omit<WorkerRuntimeEntry, "id" | "createdAt">>) {
      const current = entries.get(id)
      if (!current) return
      const next: WorkerRuntimeEntry = {
        ...current,
        ...patch,
        metrics: patch.metrics ? { ...(current.metrics ?? {}), ...patch.metrics } : current.metrics,
        id,
        createdAt: current.createdAt,
      }
      entries.set(id, next)
    },
    unregister(id: string) {
      entries.delete(id)
    },
    list() {
      return [...entries.values()].sort((a, b) => {
        if (a.kind !== b.kind) return a.kind.localeCompare(b.kind)
        if (a.name !== b.name) return a.name.localeCompare(b.name)
        return a.id.localeCompare(b.id)
      })
    },
    summary() {
      const list = this.list()
      const running = list.filter((e) => e.status === "running").length
      const stopped = list.filter((e) => e.status === "stopped").length
      const error = list.filter((e) => e.status === "error").length
      return { total: list.length, running, stopped, error }
    },
  }
}

export const workerRegistry = createWorkerRegistry()
