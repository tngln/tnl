import { createElement, Fragment } from "@tnl/canvas-interface/jsx"
import { ListRow, PanelActionRow, PanelColumn, PanelHeader, PanelScroll, PanelSection, Text, VStack, defineSurface, mountSurface } from "@tnl/canvas-interface/builder"
import { invalidateAll } from "@tnl/canvas-interface/ui"
import type { WorkerRuntimeEntry } from "@/core/workers"
import { theme } from "@tnl/canvas-interface/theme"
import type { DeveloperContext, DeveloperPanelSpec } from "../index"

function formatTime(ms: number | undefined) {
  if (!ms) return "-"
  const d = new Date(ms)
  return Number.isFinite(d.getTime()) ? d.toLocaleString() : "-"
}

function formatDuration(ms: number) {
  if (!Number.isFinite(ms) || ms < 0) return "-"
  const total = Math.floor(ms / 1000)
  const s = total % 60
  const m = Math.floor(total / 60) % 60
  const h = Math.floor(total / 3600) % 24
  const d = Math.floor(total / 86400)
  const hh = String(h).padStart(2, "0")
  const mm = String(m).padStart(2, "0")
  const ss = String(s).padStart(2, "0")
  return d > 0 ? `${d}d ${hh}:${mm}:${ss}` : `${hh}:${mm}:${ss}`
}

function workerRightText(w: WorkerRuntimeEntry) {
  const parts: string[] = []
  parts.push(w.status)
  const m = w.metrics
  if (typeof m?.inFlight === "number") parts.push(`inFlight ${m.inFlight}`)
  if (typeof m?.queued === "number") parts.push(`queued ${m.queued}`)
  if (typeof m?.completed === "number") parts.push(`done ${m.completed}`)
  if (typeof m?.canceled === "number") parts.push(`canceled ${m.canceled}`)
  return parts.join(" · ")
}

export function createWorkerPanel(): DeveloperPanelSpec {
  return {
    id: "Developer.Worker",
    title: "Worker",
    build: (ctx) => mountSurface(WorkerPanelSurface, { ctx }),
  }
}

const WorkerPanelSurface = defineSurface({
  id: "Developer.Worker.Surface",
  setup: (_props: { ctx: DeveloperContext }) => {
    let selectedId: string | null = null

    return ({ ctx }: { ctx: DeveloperContext }) => {
      const workers = ctx.workers?.list?.() ?? []
      if (selectedId && !workers.some((w) => w.id === selectedId)) selectedId = null
      if (!selectedId && workers.length) selectedId = workers[0].id

      const selected = selectedId ? workers.find((w) => w.id === selectedId) ?? null : null
      const running = workers.filter((w) => w.status === "running").length
      const stopped = workers.filter((w) => w.status === "stopped").length
      const error = workers.filter((w) => w.status === "error").length
      const headerMeta = workers.length ? `${workers.length} workers` : "No workers"

      return (
        <PanelColumn>
          <PanelHeader title="Workers" meta={headerMeta}>
            <Text tone="muted" size="meta">
              {workers.length ? `running ${running} · stopped ${stopped} · error ${error}` : "No worker registry entries yet."}
            </Text>
          </PanelHeader>
          <PanelActionRow
            key="worker.actions"
            compact
            actions={[
              { key: "refresh", icon: "R", text: "Refresh", title: "Refresh", onClick: () => invalidateAll() },
            ]}
          />
          <PanelScroll key="worker.scroll">
            <VStack style={{ padding: 6, gap: 10 }}>
              <PanelSection key="worker.summary" title="Summary">
                <VStack>
                  <ListRow key="worker.summary.total" leftText="Total" rightText={String(workers.length)} />
                  <ListRow key="worker.summary.running" leftText="Running" rightText={String(running)} />
                  <ListRow key="worker.summary.stopped" leftText="Stopped" rightText={String(stopped)} />
                  <ListRow key="worker.summary.error" leftText="Error" rightText={String(error)} />
                </VStack>
              </PanelSection>

              <PanelSection key="worker.list" title="Workers">
                {workers.length ? (
                  <VStack>
                    {workers.map((w) => (
                      <ListRow
                        key={`worker.row.${w.id}`}
                        leftText={`${w.name} (${w.kind})`}
                        rightText={workerRightText(w)}
                        selected={w.id === selectedId}
                        onClick={() => {
                          selectedId = w.id
                          invalidateAll()
                        }}
                      />
                    ))}
                  </VStack>
                ) : (
                  <Text tone="muted">No workers have registered yet.</Text>
                )}
              </PanelSection>

              <PanelSection key="worker.selected" title="Selected">
                {selected ? (
                  <Fragment>
                    <VStack>
                      <ListRow key="worker.sel.id" leftText="Id" rightText={selected.id} />
                      <ListRow key="worker.sel.kind" leftText="Kind" rightText={selected.kind} />
                      <ListRow key="worker.sel.name" leftText="Name" rightText={selected.name} />
                      <ListRow key="worker.sel.status" leftText="Status" rightText={selected.status} />
                      <ListRow key="worker.sel.created" leftText="Created" rightText={formatTime(selected.createdAt)} />
                      <ListRow key="worker.sel.uptime" leftText="Uptime" rightText={formatDuration(Date.now() - selected.createdAt)} />
                      <ListRow key="worker.sel.last" leftText="Last Message" rightText={formatTime(selected.lastMessageAt)} />
                    </VStack>
                    {selected.metrics?.lastError ? (
                      <Text color={theme.colors.danger} size="meta" style={{ margin: { t: 8, r: 0, b: 0, l: 0 } }}>
                        {selected.metrics.lastError}
                      </Text>
                    ) : null}
                  </Fragment>
                ) : (
                  <Text tone="muted">Select a worker to see details.</Text>
                )}
              </PanelSection>
            </VStack>
          </PanelScroll>
        </PanelColumn>
      )
    }
  },
})
