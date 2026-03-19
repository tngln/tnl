import { theme } from "@tnl/canvas-interface/theme"
import { openOpfs, type OpfsEntryV1 } from "@tnl/app/platform"
import { showAlert, showConfirm, showPrompt } from "@tnl/app/platform"
import { downloadBlob, pickFiles } from "@tnl/app/platform"
import { buildAcceptString } from "@tnl/app/platform"
import { createElement } from "@tnl/canvas-interface/jsx"
import { ListRow, PanelActionRow, PanelColumn, PanelHeader, PanelScroll, Text, VStack, defineSurface, mountSurface } from "@tnl/canvas-interface/builder"
import { invalidateAll } from "@tnl/canvas-interface/ui"
import { formatBytes } from "@tnl/canvas-interface/util"
import type { DeveloperPanelSpec } from "@tnl/canvas-interface/developer"
import { createAsyncJobState } from "@/ui/async_state"

export function createStoragePanel(): DeveloperPanelSpec {
  return {
    id: "Developer.Storage",
    title: "Storage",
    build: (_ctx) => mountSurface(StoragePanelSurface, {}),
  }
}

function formatUsageText(usage: { entries: number; bytes: number; quota?: number; usage?: number }) {
  const parts: string[] = []
  parts.push(`${usage.entries} files`)
  parts.push(formatBytes(usage.bytes))
  if (typeof usage.usage === "number" && typeof usage.quota === "number" && usage.quota > 0) {
    const pct = Math.min(100, Math.max(0, (usage.usage / usage.quota) * 100))
    parts.push(`${formatBytes(usage.usage)} / ${formatBytes(usage.quota)} (${pct.toFixed(1)}%)`)
  }
  return parts.join(" · ")
}

type StorageSnapshot = {
  entries: OpfsEntryV1[]
  usage: { entries: number; bytes: number; quota?: number; usage?: number }
  selectedPath: string | null
}

export const StoragePanelSurface = defineSurface({
  id: "Developer.Storage.Surface",
  setup: () => {
    let fsPromise: ReturnType<typeof openOpfs> | null = null
    let initialized = false

    let entries: OpfsEntryV1[] = []
    let usage: { entries: number; bytes: number; quota?: number; usage?: number } = { entries: 0, bytes: 0 }
    let prefix: string | null = null
    let selectedPath: string | null = null
    const asyncState = createAsyncJobState({ invalidate: invalidateAll })

    const ensureFs = async () => {
      if (!fsPromise) fsPromise = openOpfs()
      return await fsPromise
    }

    const loadSnapshot = async (nextPrefix: string | null, nextSelectedPath: string | null): Promise<StorageSnapshot> => {
      const fs = await ensureFs()
      const [rawEntries, nextUsage] = await Promise.all([fs.list(nextPrefix ?? undefined), fs.getUsage()])
      const nextEntries = rawEntries.sort((a, b) => b.size - a.size || a.path.localeCompare(b.path))
      return {
        entries: nextEntries,
        usage: nextUsage,
        selectedPath: nextSelectedPath && nextEntries.some((entry) => entry.path === nextSelectedPath) ? nextSelectedPath : null,
      }
    }

    const applySnapshot = (snapshot: StorageSnapshot) => {
      entries = snapshot.entries
      usage = snapshot.usage
      selectedPath = snapshot.selectedPath
    }

    const refresh = async () => {
      await asyncState.runLatest(async (run) => {
        const snapshot = await loadSnapshot(prefix, selectedPath)
        run.commit(() => applySnapshot(snapshot))
      })
    }

    const upload = async () => {
      const files = await pickFiles({
        multiple: true,
        accept: `${buildAcceptString("video")},${buildAcceptString("audio")},${buildAcceptString("image")}`,
        inputId: "tnl-devtools-file-input",
      })
      if (!files.length) return
      const nextPrefix = (prefix ?? "uploads").trim() || "uploads"
      await asyncState.runLatest(async (run) => {
        const fs = await ensureFs()
        for (const file of files) {
          await fs.writeFile(`${nextPrefix}/${file.name}`, file, { type: file.type || "application/octet-stream" })
        }
        const snapshot = await loadSnapshot(prefix, selectedPath)
        run.commit(() => applySnapshot(snapshot))
      })
    }

    const downloadSelected = async () => {
      const path = selectedPath
      if (!path) return
      await asyncState.run(async () => {
        const fs = await ensureFs()
        const blob = await fs.readFile(path)
        downloadBlob(blob, path.split("/").pop() ?? "download")
      })
    }

    const deleteSelected = async () => {
      const path = selectedPath
      if (!path) return
      if (!showConfirm(`Delete ${path}?`)) return
      await asyncState.runLatest(async (run) => {
        const fs = await ensureFs()
        await fs.delete(path)
        const snapshot = await loadSnapshot(prefix, null)
        run.commit(() => applySnapshot(snapshot))
      })
    }

    const editSelectedMeta = async () => {
      const path = selectedPath
      if (!path) return
      const current = entries.find((entry) => entry.path === path)
      const type = showPrompt("type (mime)", current?.type ?? "application/octet-stream")
      if (type === null) return
      const extrasText = showPrompt("extras (JSON)", JSON.stringify(current?.extras ?? {}, null, 2))
      if (extrasText === null) return

      let extras: Record<string, unknown> | undefined
      try {
        const parsed = JSON.parse(extrasText)
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) extras = parsed
        else extras = { value: parsed }
      } catch {
        showAlert("Invalid JSON")
        return
      }

      await asyncState.runLatest(async (run) => {
        const fs = await ensureFs()
        await fs.updateMeta(path, { type: type.trim() || current?.type, extras })
        const snapshot = await loadSnapshot(prefix, path)
        run.commit(() => applySnapshot(snapshot))
      })
    }

    const setPrefix = async () => {
      const next = showPrompt("prefix (optional)", prefix ?? "")
      if (next === null) return
      const value = next.trim()
      const nextPrefix = value ? value : null
      await asyncState.runLatest(async (run) => {
        const snapshot = await loadSnapshot(nextPrefix, null)
        run.commit(() => {
          prefix = nextPrefix
          applySnapshot(snapshot)
        })
      })
    }

    return () => {
      if (!initialized) {
        initialized = true
        void refresh()
      }

      const busy = asyncState.busy()
      const error = asyncState.error()
      const selected = selectedPath !== null
      const statusText = busy ? "Working..." : error ? error : formatUsageText(usage)
      const statusColor = error ? theme.colors.danger : theme.colors.textMuted
      const selectionMeta = selectedPath ? selectedPath : prefix ? `prefix: ${prefix}` : "root"

      return (
        <PanelColumn>
          <PanelHeader key="storage.header" title="Storage" meta={selectionMeta}>
            <Text tone="muted" size="meta" color={statusColor}>{statusText}</Text>
          </PanelHeader>
          <PanelActionRow
            key="storage.actions"
            compact
            actions={[
              { key: "refresh", icon: "R", text: busy ? "Refreshing" : "Refresh", title: busy ? "Refreshing" : "Refresh", onClick: () => void refresh() },
              { key: "upload", icon: "U", text: "Upload", title: "Upload", onClick: () => void upload() },
              { key: "download", icon: "D", text: "Download", title: "Download", onClick: () => void downloadSelected(), disabled: !selected },
              { key: "delete", icon: "X", text: "Delete", title: "Delete", onClick: () => void deleteSelected(), disabled: !selected },
              { key: "edit", icon: "M", text: "Edit Meta", title: "Edit Meta", onClick: () => void editSelectedMeta(), disabled: !selected },
              { key: "prefix", icon: "P", text: prefix ? "Prefix*" : "Prefix", title: prefix ? `Prefix: ${prefix}` : "Set Prefix", onClick: () => void setPrefix() },
            ]}
          />
          <PanelScroll key="storage.list">
            <VStack style={{ padding: { l: 2, t: 2, r: 14, b: 2 } }}>
              {entries.map((entry) => (
                <ListRow
                  key={`storage.row.${entry.path}`}
                  leftText={entry.path}
                  rightText={`${formatBytes(entry.size)} · ${entry.type}`}
                  variant="item"
                  selected={entry.path === selectedPath}
                  onClick={() => {
                    selectedPath = entry.path
                    invalidateAll()
                  }}
                />
              ))}
            </VStack>
          </PanelScroll>
        </PanelColumn>
      )
    }
  },
})
