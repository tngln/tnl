import { createElement, Fragment } from "../../../jsx"
import { Column, RowItem, ScrollArea, Spacer, Text, ToolbarRow } from "../../../builder/components"
import { defineSurface, mountSurface } from "../../../builder/surface_builder"
import { theme } from "../../../../config/theme"
import type { DeveloperPanelSpec } from "../index"
import { getStateTree, type DataNode } from "../states"

export function createDataPanel(): DeveloperPanelSpec {
  return {
    id: "Developer.Data",
    title: "Data",
    build: (_ctx) => mountSurface(DataPanelSurface, {}),
  }
}

type FlatRow = { kind: "group" | "signal"; id: string; depth: number; label: string; right?: string }

function rows(tree: DataNode[], expanded: Set<string>): FlatRow[] {
  const rows: FlatRow[] = []
  for (const g of tree) {
    if (g.kind !== "group") continue
    rows.push({ kind: "group", id: g.id, depth: 0, label: `${g.label}`, right: `${g.count}` })
    if (!expanded.has(g.id)) continue
    for (const c of g.children) {
      if (c.kind !== "signal") continue
      rows.push({
        kind: "signal",
        id: c.id,
        depth: 1,
        label: c.label,
        right: `${c.valuePreview}${c.subscribers ? ` · ${c.subscribers}` : ""}`,
      })
    }
  }
  return rows
}

export const DataPanelSurface = defineSurface({
  id: "Developer.Data.Surface",
  setup: () => {
    const expanded = new Set<string>()
    let initialized = false

    const toggleGroup = (id: string) => {
      if (expanded.has(id)) expanded.delete(id)
      else expanded.add(id)
    }

    return () => {
      const tree = getStateTree()
      if (!initialized) {
        for (const n of tree) if (n.kind === "group") expanded.add(n.id)
        initialized = true
      }
      const flatRows = rows(tree, expanded)
      return (
        <Column style={{ axis: "column", padding: theme.spacing.sm, gap: theme.spacing.sm, w: "auto", h: "auto" }}>
          <ToolbarRow key="data.toolbar">
            <Text key="data.title" color={theme.colors.textPrimary} emphasis={{ bold: true }}>State Tree</Text>
            <Spacer style={{ fill: true }} />
            <Text key="data.meta" color={theme.colors.textMuted}>{`${flatRows.length} rows`}</Text>
          </ToolbarRow>
          <ScrollArea key="data.scroll" style={{ fill: true }} box={{ fill: "rgba(255,255,255,0.01)" }}>
            <Column key="data.rows" style={{ axis: "column", gap: 0, padding: { l: 2, t: 2, r: 14, b: 2 }, w: "auto", h: "auto" }}>
              {flatRows.map((row, index) => (
                <RowItem
                  key={`data.row.${row.id}.${index}`}
                  leftText={row.label}
                  rightText={row.right}
                  indent={row.depth * 14}
                  variant={row.kind === "group" ? "group" : "item"}
                  onClick={row.kind === "group" ? () => toggleGroup(row.id) : undefined}
                />
              ))}
            </Column>
          </ScrollArea>
        </Column>
      )
    }
  },
})
