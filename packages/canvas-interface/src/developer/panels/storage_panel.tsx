import { theme } from "../../theme"
import { openOpfs, type OpfsEntryV1, showAlert, showConfirm, showPrompt, downloadBlob, pickFiles } from "../../platform/web"
import { createElement } from "../../jsx"
import { Label, ListRow, PanelActionRow, PanelColumn, PanelHeader, PanelScroll, VStack, defineSurface, mountSurface } from "../../builder"
import { downloadIcon, filterIcon, pencilIcon, refreshIcon, trashIcon, uploadIcon } from "../../icons"
import { signal } from "../../reactivity"
import { formatBytes } from "../../util"
import type { DeveloperPanelSpec } from "../index"
import { createAsyncJobState } from "../../async_state"

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

const STORAGE_ACCEPT = "video/*,audio/*,image/*"

export const StoragePanelSurface = defineSurface({
  id: "Developer.Storage.Surface",
  setup: () => {
    let fsPromise: ReturnType<typeof openOpfs> | null = null
    let initialized = false
    const rerenderTick = signal(0, { debugLabel: "developer.storage.rerender" })
    const requestRender = () => rerenderTick.set((value) => value + 1)

    let entries: OpfsEntryV1[] = []
    let usage: { entries: number; bytes: number; quota?: number; usage?: number } = { entries: 0, bytes: 0 }
    let prefix: string | null = null
    const selectedPath = signal<string | null>(null, { debugLabel: "developer.storage.selectedPath" })
    const asyncState = createAsyncJobState({ invalidate: requestRender })

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
      selectedPath.set(snapshot.selectedPath)
    }

    const refresh = async () => {
      await asyncState.runLatest(async (run) => {
        const snapshot = await loadSnapshot(prefix, selectedPath.peek())
        run.commit(() => applySnapshot(snapshot))
      })
    }

    const upload = async () => {
      const files = await pickFiles({ multiple: true, accept: STORAGE_ACCEPT, inputId: "tnl-devtools-file-input" })
      if (!files.length) return
      const nextPrefix = (prefix ?? "uploads").trim() || "uploads"
      await asyncState.runLatest(async (run) => {
        const fs = await ensureFs()
        for (const file of files) {
          await fs.writeFile(`${nextPrefix}/${file.name}`, file, { type: file.type || "application/octet-stream" })
        }
        const snapshot = await loadSnapshot(prefix, selectedPath.peek())
        run.commit(() => applySnapshot(snapshot))
      })
    }

    const downloadSelected = async () => {
      const currentPath = selectedPath.peek()
      if (!currentPath) return
      await asyncState.run(async () => {
        const fs = await ensureFs()
        const blob = await fs.readFile(currentPath)
        downloadBlob(blob, currentPath.split("/").pop() ?? "download")
      })
    }

    const deleteSelected = async () => {
      const path = selectedPath.peek()
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
      const path = selectedPath.peek()
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
      rerenderTick.get()
      if (!initialized) {
        initialized = true
        void refresh()
      }

      const busy = asyncState.busy()
      const error = asyncState.error()
      const selectedPathValue = selectedPath.get()
      const selected = selectedPathValue !== null
      const statusText = busy ? "Working..." : error ? error : formatUsageText(usage)
      const statusColor = error ? theme.colors.danger : theme.colors.textMuted
      const selectionMeta = selectedPathValue ? selectedPathValue : prefix ? `prefix: ${prefix}` : "root"

      return (
        <PanelColumn>
          <PanelHeader key="storage.header" title="Storage" meta={selectionMeta}>
            <Label tone="muted" size="meta" color={statusColor}>{statusText}</Label>
          </PanelHeader>
          <PanelActionRow
            key="storage.actions"
            compact
            actions={[
              { key: "refresh", icon: refreshIcon, text: busy ? "Refreshing" : "Refresh", title: busy ? "Refreshing" : "Refresh", onClick: () => void refresh() },
              { key: "upload", icon: uploadIcon, text: "Upload", title: "Upload", onClick: () => void upload() },
              { key: "download", icon: downloadIcon, text: "Download", title: "Download", onClick: () => void downloadSelected(), disabled: !selected },
              { key: "delete", icon: trashIcon, text: "Delete", title: "Delete", onClick: () => void deleteSelected(), disabled: !selected },
              { key: "edit", icon: pencilIcon, text: "Edit Meta", title: "Edit Meta", onClick: () => void editSelectedMeta(), disabled: !selected },
              { key: "prefix", icon: filterIcon, text: prefix ? "Prefix*" : "Prefix", title: prefix ? `Prefix: ${prefix}` : "Set Prefix", onClick: () => void setPrefix() },
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
                  selected={entry.path === selectedPathValue}
                  onClick={() => {
                    selectedPath.set(entry.path)
                    requestRender()
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
