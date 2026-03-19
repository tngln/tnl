export type DockDropPlacement = "left" | "right" | "top" | "bottom" | "center"

export type DockSplitNode = {
  kind: "split"
  id: string
  axis: "x" | "y"
  ratio: number
  a: DockNode
  b: DockNode
}

export type DockTabsNode = {
  kind: "tabs"
  id: string
  tabs: string[]
  selectedPaneId: string
}

export type DockNode = DockSplitNode | DockTabsNode

export function clampRatio(value: number) {
  return Math.max(0.1, Math.min(0.9, value))
}

export function walkLeaves(root: DockNode | null, visit: (leaf: DockTabsNode) => void) {
  if (!root) return
  if (root.kind === "tabs") {
    visit(root)
    return
  }
  walkLeaves(root.a, visit)
  walkLeaves(root.b, visit)
}

export function findLeaf(root: DockNode | null, leafId: string): DockTabsNode | null {
  let hit: DockTabsNode | null = null
  walkLeaves(root, (leaf) => {
    if (leaf.id === leafId) hit = leaf
  })
  return hit
}

export function findLeafByPane(root: DockNode | null, paneId: string): DockTabsNode | null {
  let hit: DockTabsNode | null = null
  walkLeaves(root, (leaf) => {
    if (leaf.tabs.includes(paneId)) hit = leaf
  })
  return hit
}

export function firstLeaf(root: DockNode | null): DockTabsNode | null {
  if (!root) return null
  if (root.kind === "tabs") return root
  return firstLeaf(root.a) ?? firstLeaf(root.b)
}

export function insertPane(root: DockNode | null, opts: {
  targetLeafId: string | null
  placement: DockDropPlacement
  paneId: string
  createId: (prefix: string) => string
}): DockNode {
  if (!root || opts.targetLeafId === null) {
    return {
      kind: "tabs",
      id: opts.createId("leaf"),
      tabs: [opts.paneId],
      selectedPaneId: opts.paneId,
    }
  }

  function visit(node: DockNode): DockNode {
    if (node.kind === "tabs") {
      if (node.id !== opts.targetLeafId) return node
      if (opts.placement === "center") {
        const tabs = node.tabs.includes(opts.paneId) ? node.tabs.slice() : [...node.tabs, opts.paneId]
        return { ...node, tabs, selectedPaneId: opts.paneId }
      }
      const axis = opts.placement === "left" || opts.placement === "right" ? "x" : "y"
      const inserted: DockTabsNode = {
        kind: "tabs",
        id: opts.createId("leaf"),
        tabs: [opts.paneId],
        selectedPaneId: opts.paneId,
      }
      return {
        kind: "split",
        id: opts.createId("split"),
        axis,
        ratio: 0.5,
        a: opts.placement === "left" || opts.placement === "top" ? inserted : node,
        b: opts.placement === "left" || opts.placement === "top" ? node : inserted,
      }
    }
    return { ...node, a: visit(node.a), b: visit(node.b) }
  }

  return visit(root)
}

export function removePane(root: DockNode | null, paneId: string): DockNode | null {
  if (!root) return null

  function visit(node: DockNode): DockNode | null {
    if (node.kind === "tabs") {
      if (!node.tabs.includes(paneId)) return node
      const tabs = node.tabs.filter((id) => id !== paneId)
      if (!tabs.length) return null
      const selectedPaneId = tabs.includes(node.selectedPaneId) ? node.selectedPaneId : tabs[0]
      return { ...node, tabs, selectedPaneId }
    }

    const a = visit(node.a)
    const b = visit(node.b)
    if (!a && !b) return null
    if (!a) return b
    if (!b) return a
    return { ...node, a, b }
  }

  return visit(root)
}
