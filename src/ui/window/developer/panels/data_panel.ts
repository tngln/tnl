import { theme } from "../../../../config/theme"
import {
  BuilderSurface,
  column,
  rowItemNode,
  scrollAreaNode,
  spacer,
  textNode,
  toolbarRow,
} from "../../../builder/surface_builder"
import type { DeveloperPanelSpec } from "../index"
import { getStateTree, type DataNode } from "../states"

export function createDataPanel(): DeveloperPanelSpec {
  return {
    id: "Developer.Data",
    title: "Data",
    build: (_ctx) => new DataPanelSurface(),
  }
}

type FlatRow = { kind: "group" | "signal"; id: string; depth: number; label: string; right?: string }

class DataPanelSurface extends BuilderSurface {
  private readonly expanded = new Set<string>()
  private initialized = false

  constructor() {
    super({
      id: "Developer.Data.Surface",
      build: () => this.buildTree(),
    })
  }

  private rows(tree: DataNode[]): FlatRow[] {
    const rows: FlatRow[] = []
    for (const g of tree) {
      if (g.kind !== "group") continue
      rows.push({ kind: "group", id: g.id, depth: 0, label: `${g.label}`, right: `${g.count}` })
      if (!this.expanded.has(g.id)) continue
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

  private toggleGroup(id: string) {
    if (this.expanded.has(id)) this.expanded.delete(id)
    else this.expanded.add(id)
  }

  private buildTree() {
    const tree = getStateTree()
    if (!this.initialized) {
      for (const n of tree) if (n.kind === "group") this.expanded.add(n.id)
      this.initialized = true
    }
    const rows = this.rows(tree)
    return column(
      [
        toolbarRow(
          [
            textNode("State Tree", { key: "data.title", color: theme.colors.textPrimary, emphasis: { bold: true } }),
            spacer({ fill: true }),
            textNode(`${rows.length} rows`, { key: "data.meta", color: theme.colors.textMuted }),
          ],
          { key: "data.toolbar" },
        ),
        scrollAreaNode(
          column(
            rows.map((row, index) =>
              rowItemNode({
                key: `data.row.${row.id}.${index}`,
                leftText: row.label,
                rightText: row.right,
                indent: row.depth * 14,
                variant: row.kind === "group" ? "group" : "item",
                onClick: row.kind === "group" ? () => this.toggleGroup(row.id) : undefined,
              }),
            ),
            { axis: "column", gap: 0, padding: { l: 2, t: 2, r: 14, b: 2 }, w: "auto", h: "auto" },
            { key: "data.rows" },
          ),
          {
            key: "data.scroll",
            style: { fill: true },
            box: { fill: "rgba(255,255,255,0.01)" },
          },
        ),
      ],
      {
        axis: "column",
        padding: theme.spacing.sm,
        gap: theme.spacing.sm,
        w: "auto",
        h: "auto",
      },
    )
  }
}
