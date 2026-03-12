import { theme } from "../../../../config/theme"
import { openOpfs, type OpfsEntryV1 } from "../../../../core/opfs"
import { showAlert, showConfirm, showPrompt } from "../../../../platform/web/dialogs"
import { downloadBlob, pickFiles } from "../../../../platform/web/file_io"
import { buildAcceptString } from "../../../../platform/web/media_formats"
import { createElement, Fragment } from "../../../jsx"
import { ListRow, PanelActionRow, PanelColumn, PanelHeader, PanelScroll, Text, VStack } from "../../../builder/components"
import { defineSurface, mountSurface } from "../../../builder/surface_builder"
import { invalidateAll } from "../../../invalidate"
import { formatBytes } from "../../../../util/util"
import type { DeveloperPanelSpec } from "../index"

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

export const StoragePanelSurface = defineSurface({
  id: "Developer.Storage.Surface",
  setup: () => {
    let fsPromise: ReturnType<typeof openOpfs> | null = null
    let opSeq = 0
    let initialized = false

    let entries: OpfsEntryV1[] = []
    let usage: { entries: number; bytes: number; quota?: number; usage?: number } = { entries: 0, bytes: 0 }
    let error: string | null = null
    let busy = false
    let prefix: string | null = null
    let selectedPath: string | null = null

    const ensureFs = async () => {
      if (!fsPromise) fsPromise = openOpfs()
      return await fsPromise
    }

    const refresh = async () => {
      const seq = ++opSeq
      busy = true
      error = null
      invalidateAll()
      try {
        const fs = await ensureFs()
        const nextEntries = await fs.list(prefix ?? undefined)
        const nextUsage = await fs.getUsage()
        if (seq !== opSeq) return
        entries = nextEntries.sort((a, b) => b.size - a.size || a.path.localeCompare(b.path))
        usage = nextUsage
        if (selectedPath && !entries.some((e) => e.path === selectedPath)) selectedPath = null
      } catch (e) {
        if (seq !== opSeq) return
        error = e instanceof Error ? e.message : String(e)
      } finally {
        if (seq !== opSeq) return
        busy = false
        invalidateAll()
      }
    }

    const upload = async () => {
      const files = await pickFiles({
        multiple: true,
        accept: `${buildAcceptString("video")},${buildAcceptString("audio")},${buildAcceptString("image")}`,
        inputId: "tnl-devtools-file-input",
      })
      if (!files.length) return
      const nextPrefix = (prefix ?? "uploads").trim() || "uploads"
      const seq = ++opSeq
      busy = true
      invalidateAll()
      try {
        const fs = await ensureFs()
        for (const file of files) {
          await fs.writeFile(`${nextPrefix}/${file.name}`, file, { type: file.type || "application/octet-stream" })
        }
        if (seq !== opSeq) return
        await refresh()
      } catch (e) {
        if (seq !== opSeq) return
        error = e instanceof Error ? e.message : String(e)
      } finally {
        if (seq !== opSeq) return
        busy = false
        invalidateAll()
      }
    }

    const downloadSelected = async () => {
      const path = selectedPath
      if (!path) return
      const seq = ++opSeq
      busy = true
      invalidateAll()
      try {
        const fs = await ensureFs()
        const blob = await fs.readFile(path)
        if (seq !== opSeq) return
        downloadBlob(blob, path.split("/").pop() ?? "download")
      } catch (e) {
        if (seq !== opSeq) return
        error = e instanceof Error ? e.message : String(e)
      } finally {
        if (seq !== opSeq) return
        busy = false
        invalidateAll()
      }
    }

    const deleteSelected = async () => {
      const path = selectedPath
      if (!path) return
      if (!showConfirm(`Delete ${path}?`)) return
      const seq = ++opSeq
      busy = true
      invalidateAll()
      try {
        const fs = await ensureFs()
        await fs.delete(path)
        if (seq !== opSeq) return
        selectedPath = null
        await refresh()
      } catch (e) {
        if (seq !== opSeq) return
        error = e instanceof Error ? e.message : String(e)
      } finally {
        if (seq !== opSeq) return
        busy = false
        invalidateAll()
      }
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

      const seq = ++opSeq
      busy = true
      invalidateAll()
      try {
        const fs = await ensureFs()
        await fs.updateMeta(path, { type: type.trim() || current?.type, extras })
        if (seq !== opSeq) return
        await refresh()
      } catch (e) {
        if (seq !== opSeq) return
        error = e instanceof Error ? e.message : String(e)
      } finally {
        if (seq !== opSeq) return
        busy = false
        invalidateAll()
      }
    }

    const setPrefix = () => {
      const next = showPrompt("prefix (optional)", prefix ?? "")
      if (next === null) return
      const value = next.trim()
      prefix = value ? value : null
      selectedPath = null
      void refresh()
    }

    return () => {
      if (!initialized) {
        initialized = true
        void refresh()
      }

      const selected = selectedPath !== null
      const statusText = busy ? "Working..." : error ? error : formatUsageText(usage)
      const statusColor = error ? theme.colors.dangerText : theme.colors.textMuted
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
              { key: "prefix", icon: "P", text: prefix ? "Prefix*" : "Prefix", title: prefix ? `Prefix: ${prefix}` : "Set Prefix", onClick: setPrefix },
            ]}
          />
          <PanelScroll key="storage.list">
            <VStack style={{ axis: "column", gap: 0, padding: { l: 2, t: 2, r: 14, b: 2 }, w: "auto", h: "auto" }}>
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
