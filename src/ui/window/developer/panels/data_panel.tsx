import { createElement, Fragment } from "@/ui/jsx"
import { Button, PanelColumn, PanelScroll, PanelSection, PanelToolbar, Spacer, Text, TreeView, VStack } from "@/ui/builder/components"
import { defineSurface, mountSurface, type TreeItem } from "@/ui/builder/surface_builder"
import type { DeveloperPanelSpec } from "../index"
import { getStateTreeItems } from "../states"
import { listSignals, type DebugSignalRecord } from "@/core/reactivity"
import { collectIds, formatLocalTime } from "@/util/util"

export function createDataPanel(): DeveloperPanelSpec {
  return {
    id: "Developer.Data",
    title: "Data",
    build: (_ctx) => mountSurface(DataPanelSurface, {}),
  }
}

function collectExpandableIds(items: TreeItem[], ids: Set<string>) {
  for (const item of items) {
    if (item.children?.length) {
      ids.add(item.id)
      collectExpandableIds(item.children, ids)
    }
  }
}

function formatStack(stack: string | undefined) {
  if (!stack) return ""
  const raw = stack.split("\n").map((l) => l.trim()).filter(Boolean)
  const lines = raw.length && raw[0] === "Error" ? raw.slice(1) : raw
  const filtered = lines.filter((l) =>
    !l.includes("src/core/reactivity")
    && !l.includes("reactivity.ts")
    && !l.includes("Object.signal")
    && !l.includes(" at signal ")
    && !l.includes("\tsignal ")
  )
  return (filtered.length ? filtered : lines).slice(0, 6).join("\n")
}

function tryJson(value: unknown) {
  try {
    const s = JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? String(v) : v), 2)
    if (!s) return ""
    if (s.length <= 2000) return s
    return s.slice(0, 2000) + "\n…"
  } catch {
    return ""
  }
}

export const DataPanelSurface = defineSurface({
  id: "Developer.Data.Surface",
  setup: () => {
    const expanded = new Set<string>()
    let selectedId: string | null = null
    let initialized = false

    const pruneExpanded = (items: TreeItem[]) => {
      const ids = new Set<string>()
      collectIds(items, ids)
      for (const id of [...expanded]) if (!ids.has(id)) expanded.delete(id)
      if (selectedId && !ids.has(selectedId)) selectedId = null
      if (!selectedId && items.length) selectedId = items[0]!.id
    }

    return () => {
      const records = listSignals()
      const byId = new Map<string, DebugSignalRecord>()
      for (const r of records) byId.set(`signal:${r.id}`, r)
      const items = getStateTreeItems(records)
      if (!initialized) {
        for (const item of items) expanded.add(item.id)
        initialized = true
      }
      pruneExpanded(items)
      const expandableIds = new Set<string>()
      collectExpandableIds(items, expandableIds)
      const hasCollapsed = [...expandableIds].some((id) => !expanded.has(id))
      const selected = selectedId ? byId.get(selectedId) ?? null : null
      const selectedValue = selected ? selected.peek() : null
      const selectedJson = selected ? tryJson(selectedValue) : ""
      const selectedStack = selected ? formatStack(selected.createdStack) : ""
      return (
        <PanelColumn>
          <PanelToolbar key="data.toolbar">
            <Text key="data.title" weight="bold">State Tree</Text>
            <Spacer style={{ fixed: 8 }} />
            <Button
              key="data.expandCollapse"
              text={hasCollapsed ? "Expand All" : "Collapse All"}
              title={hasCollapsed ? "Expand all groups" : "Collapse all groups"}
              style={{ fixed: 110 }}
              disabled={!expandableIds.size}
              onClick={() => {
                if (hasCollapsed) {
                  for (const id of expandableIds) expanded.add(id)
                } else {
                  expanded.clear()
                }
              }}
            />
            <Spacer style={{ fill: true }} />
            <Text key="data.meta" tone="muted" size="meta">{`${items.length} roots`}</Text>
          </PanelToolbar>
          <PanelSection title="Selection" key="data.selection">
            <VStack style={{ axis: "column", gap: 4, w: "auto", h: "auto" }}>
              {selected ? (
                <Fragment>
                  <Text weight="bold">{selected.debugLabel ?? selected.name ?? `signal#${selected.id}`}</Text>
                  <Text tone="muted" size="meta">{`scope: ${selected.scope ?? "unknown"} · id: ${selected.id} · subs: ${selected.subscribers} · created: ${formatLocalTime(selected.createdAt)}`}</Text>
                  {selectedJson ? <Text tone="muted" size="meta">{selectedJson}</Text> : <Text tone="muted" size="meta">{String(selectedValue)}</Text>}
                  {selectedStack ? <Text tone="muted" size="meta">{selectedStack}</Text> : null}
                </Fragment>
              ) : (
                <Text tone="muted" size="meta">Select a signal node to see details.</Text>
              )}
            </VStack>
          </PanelSection>
          <PanelScroll key="data.scroll">
            {items.length ? (
              <TreeView
                key="data.treeview"
                items={items}
                expanded={expanded}
                selectedId={selectedId}
                onSelect={(id) => {
                  selectedId = id
                }}
                onToggle={(id) => {
                  if (expanded.has(id)) expanded.delete(id)
                  else expanded.add(id)
                }}
              />
            ) : (
              <VStack style={{ axis: "column", gap: 0, padding: { l: 2, t: 2, r: 14, b: 2 }, w: "auto", h: "auto" }}>
                <Text tone="muted" size="meta">No signals</Text>
              </VStack>
            )}
          </PanelScroll>
        </PanelColumn>
      )
    }
  },
})
