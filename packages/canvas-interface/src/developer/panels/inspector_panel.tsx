import { createElement, Fragment } from "../../jsx"
import { PanelActionRow, PanelColumn, PanelHeader, PanelScroll, PanelSection, Text, TreeView, VStack, defineSurface, mountSurface, treeItem, type TreeItem } from "../../builder"
import { signal } from "../../reactivity"
import { collectIds } from "../../util"
import type { DebugTreeNodeSnapshot } from "../../ui"
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
    const selectedId = signal<string | null>(null, { debugLabel: "developer.inspector.selectedId" })
    const pickActive = signal(false, { debugLabel: "developer.inspector.pickActive" })
    const pickHover = signal<string | null>(null, { debugLabel: "developer.inspector.pickHover" })
    let expanded = new Set<string>()
    let didSeedExpansion = false
    let lastOverlayRect: { x: number; y: number; w: number; h: number } | null = null
    let stopPick: (() => void) | null = null

    const rectEqual = (a: { x: number; y: number; w: number; h: number } | null, b: { x: number; y: number; w: number; h: number } | null) => {
      if (!a && !b) return true
      if (!a || !b) return false
      return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h
    }

    const applyOverlay = (ctx: DeveloperContext, node: DebugTreeNodeSnapshot | null) => {
      const rect = node?.bounds ?? null
      if (!ctx.surface?.setOverlay) return
      if (rectEqual(rect, lastOverlayRect)) return
      ctx.surface?.setOverlay?.(rect)
      lastOverlayRect = rect ? { ...rect } : null
    }

    const stopPicking = () => {
      stopPick?.()
      stopPick = null
      pickActive.set(false)
      pickHover.set(null)
    }

    return ({ ctx }: { ctx: DeveloperContext }) => {
      const tree = ctx.inspector?.tree?.() ?? null
      const items = tree ? [toTreeItem(tree, "0")] : []
      const ids = new Set<string>()
      collectIds(items, ids)
      pruneExpanded(expanded, ids)
      if (selectedId.peek() && !ids.has(selectedId.peek()!)) selectedId.set(null)
      if (tree && !didSeedExpansion) {
        seedDefaultExpansion(tree, expanded)
        didSeedExpansion = true
      }
      if (!tree) didSeedExpansion = false

      const selected = tree && selectedId.peek() ? findNode(tree, selectedId.peek()!, "0") : null
      applyOverlay(ctx, selected)
      const nodeCount = countNodes(items)
      const headerMeta = selected ? describeBounds(selected) : nodeCount ? `${nodeCount} nodes` : "No data"
      const selectionMeta = selected ? [selected.kind, selected.type, selected.id].filter(Boolean).join(" · ") : tree ? "No selection" : "Waiting for runtime tree"
      const overlayActive = !!lastOverlayRect
      const picking = pickActive.get()
      const pickingMeta = pickHover.get()

      return (
        <PanelColumn>
          <PanelHeader title="Inspector Tree" meta={headerMeta}>
            <Text tone="muted" size="meta">{picking ? `Picking · ${pickingMeta ?? "Hover an object and click to select."}` : selectionMeta}</Text>
          </PanelHeader>
          <PanelActionRow
            key="inspector.actions"
            compact
            actions={[
              {
                key: "pick",
                icon: picking ? "P" : "p",
                text: picking ? "Picking" : "Pick",
                title: picking ? "Cancel element picker" : "Pick an element from the canvas",
                onClick: picking
                  ? () => stopPicking()
                  : ctx.inspector?.beginPick
                    ? () => {
                        pickActive.set(true)
                        stopPick = ctx.inspector?.beginPick?.({
                          onHover: (hit) => {
                            pickHover.set(hit ? `${hit.label}${hit.id ? ` · ${hit.id}` : ""}` : null)
                          },
                          onPick: (hit) => {
                            stopPick = null
                            pickActive.set(false)
                            pickHover.set(null)
                            if (!hit) return
                            expandPath(expanded, hit.path)
                            selectedId.set(hit.path)
                          },
                          onCancel: () => {
                            stopPick = null
                            pickActive.set(false)
                            pickHover.set(null)
                          },
                        }) ?? null
                      }
                    : undefined,
                disabled: !picking && !ctx.inspector?.beginPick,
              },
              {
                key: "clear",
                icon: "X",
                text: "Clear",
                title: "Clear selection and overlay",
                onClick: () => {
                  stopPicking()
                  selectedId.set(null)
                  applyOverlay(ctx, null)
                },
                disabled: !selectedId.peek() && !overlayActive,
              },
            ]}
          />
          <PanelSection title="Selection" key="inspector.selection">
            <VStack style={{ gap: 4 }}>
              <Text weight="bold">{selected?.label ?? "No selection"}</Text>
              <Text tone="muted" size="meta">{selected ? describeNode(selected) : tree ? "Select a node to see details." : "Inspector runtime tree is not connected."}</Text>
              <Text tone="muted" size="meta">{selected ? `Listeners: ${describeListeners(selected)}` : "Listeners: -"}</Text>
              <Text tone="muted" size="meta">{selected ? `Runtime: ${describeRuntime(selected)}` : "Runtime: -"}</Text>
            </VStack>
          </PanelSection>
          <PanelScroll key="inspector.tree">
            {items.length ? (
              <TreeView
                key="inspector.treeview"
                items={items}
                expanded={expanded}
                selectedId={selectedId.get()}
                onSelect={(id) => {
                  selectedId.set(id)
                  if (tree) applyOverlay(ctx, findNode(tree, id, "0"))
                }}
                onToggle={(id) => {
                  if (expanded.has(id)) expanded.delete(id)
                  else expanded.add(id)
                }}
              />
            ) : (
              <VStack style={{ padding: { l: 2, t: 2, r: 14, b: 2 } }}>
                <Text tone="muted" size="meta">No runtime tree available</Text>
              </VStack>
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

function pruneExpanded(expanded: Set<string>, ids: Set<string>) {
  for (const id of [...expanded]) if (!ids.has(id)) expanded.delete(id)
}

function expandPath(expanded: Set<string>, id: string) {
  const parts = id.split(".")
  for (let i = 0; i < parts.length - 1; i++) expanded.add(parts.slice(0, i + 1).join("."))
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

function describeListeners(node: DebugTreeNodeSnapshot) {
  const listeners = node.listeners ?? []
  if (!listeners.length) return "-"
  return listeners
    .map((l) => (l.detail ? `${l.label} (${l.detail})` : l.label))
    .join(", ")
}

function describeRowMeta(node: DebugTreeNodeSnapshot) {
  const parts: string[] = [node.kind]
  if (typeof node.z === "number") parts.push(`z${node.z}`)
  if (node.id) parts.push(node.id)
  if (node.meta) parts.push(node.meta)
  return parts.join(" · ")
}

function describeRuntime(node: DebugTreeNodeSnapshot) {
  const runtime = node.runtime
  if (!runtime?.fields.length) return "-"
  return runtime.fields.map((field) => `${field.label}: ${field.value}`).join(" · ")
}
