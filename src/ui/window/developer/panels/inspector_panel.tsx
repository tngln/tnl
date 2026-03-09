import { createElement, Fragment } from "../../../jsx"
import { Column, PanelColumn, PanelHeader, PanelScroll, PanelSection, Text, TreeView } from "../../../builder/components"
import { defineSurface, mountSurface, treeItem, type TreeItem } from "../../../builder/surface_builder"
import type { DebugTreeNodeSnapshot } from "../../../base/ui"
import type { DeveloperContext, DeveloperPanelSpec } from "../index"

export function createInspectorPanel(): DeveloperPanelSpec {
  return {
    id: "Developer.Inspector",
    title: "Inspector",
    build: (ctx) => mountSurface(InspectorPanelSurface, { ctx }),
  }
}

const InspectorPanelSurface = defineSurface({
  id: "Developer.Inspector.Surface",
  setup: (_props: { ctx: DeveloperContext }) => {
    let selectedId: string | null = null
    let expanded = new Set<string>()
    let didSeedExpansion = false

    return ({ ctx }: { ctx: DeveloperContext }) => {
      const tree = ctx.inspector?.tree?.() ?? null
      const items = tree ? [toTreeItem(tree, "0")] : []
      const ids = new Set<string>()
      collectIds(items, ids)
      pruneExpanded(expanded, ids)
      if (selectedId && !ids.has(selectedId)) selectedId = null
      if (!selectedId && items.length) selectedId = items[0].id
      if (tree && !didSeedExpansion) {
        seedDefaultExpansion(tree, expanded)
        didSeedExpansion = true
      }
      if (!tree) didSeedExpansion = false

      const selected = tree && selectedId ? findNode(tree, selectedId, "0") : null
      const nodeCount = countNodes(items)
      const headerMeta = selected ? describeBounds(selected) : nodeCount ? `${nodeCount} nodes` : "No data"
      const selectionMeta = selected ? [selected.kind, selected.type, selected.id].filter(Boolean).join(" · ") : "Waiting for runtime tree"

      return (
        <PanelColumn>
          <PanelHeader title="Inspector Tree" meta={headerMeta}>
            <Text tone="muted" size="meta">{selectionMeta}</Text>
          </PanelHeader>
          <PanelSection title="Selection" key="inspector.selection">
            <Column style={{ axis: "column", gap: 4, w: "auto", h: "auto" }}>
              <Text weight="bold">{selected?.label ?? "No selection"}</Text>
              <Text tone="muted" size="meta">{selected ? describeNode(selected) : "Inspector runtime tree is not connected."}</Text>
            </Column>
          </PanelSection>
          <PanelScroll key="inspector.tree">
            {items.length ? (
              <TreeView
                key="inspector.treeview"
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
              <Column style={{ axis: "column", gap: 0, padding: { l: 2, t: 2, r: 14, b: 2 }, w: "auto", h: "auto" }}>
                <Text tone="muted" size="meta">No runtime tree available</Text>
              </Column>
            )}
          </PanelScroll>
        </PanelColumn>
      )
    }
  },
})

function toTreeItem(node: DebugTreeNodeSnapshot, path: string): TreeItem {
  return treeItem(path, node.label, {
    meta: describeRowMeta(node),
    variant: node.kind === "surface" ? "group" : "item",
    children: node.children.map((child, index) => toTreeItem(child, `${path}.${index}`)),
  })
}

function seedDefaultExpansion(node: DebugTreeNodeSnapshot, expanded: Set<string>) {
  expanded.add("0")
  for (let i = 0; i < node.children.length; i++) expanded.add(`0.${i}`)
}

function collectIds(items: TreeItem[], ids: Set<string>) {
  for (const item of items) {
    ids.add(item.id)
    if (item.children?.length) collectIds(item.children, ids)
  }
}

function pruneExpanded(expanded: Set<string>, ids: Set<string>) {
  for (const id of [...expanded]) if (!ids.has(id)) expanded.delete(id)
}

function countNodes(items: TreeItem[]): number {
  let count = 0
  const visit = (next: TreeItem[]) => {
    for (const item of next) {
      count += 1
      if (item.children?.length) visit(item.children)
    }
  }
  visit(items)
  return count
}

function findNode(root: DebugTreeNodeSnapshot, id: string, path: string): DebugTreeNodeSnapshot | null {
  if (path === id) return root
  for (let i = 0; i < root.children.length; i++) {
    const child = root.children[i]
    const hit = findNode(child, id, `${path}.${i}`)
    if (hit) return hit
  }
  return null
}

function describeBounds(node: DebugTreeNodeSnapshot) {
  if (!node.bounds) return node.id ?? node.type
  return `${Math.round(node.bounds.w)}x${Math.round(node.bounds.h)} @ ${Math.round(node.bounds.x)},${Math.round(node.bounds.y)}`
}

function describeNode(node: DebugTreeNodeSnapshot) {
  return [node.kind, node.type, node.id, node.meta, describeBounds(node)].filter(Boolean).join(" · ")
}

function describeRowMeta(node: DebugTreeNodeSnapshot) {
  const parts: string[] = [node.kind]
  if (typeof node.z === "number") parts.push(`z${node.z}`)
  if (node.id) parts.push(node.id)
  return parts.join(" · ")
}
