import { listSignals, type DebugSignalRecord } from "../../../core/reactivity"
import { treeItem, type TreeItem } from "../../builder/surface_builder"

function labelForSignal(r: DebugSignalRecord) {
  const name = r.name?.trim()
  if (name) return name
  const debugLabel = r.debugLabel?.trim()
  if (debugLabel) return debugLabel
  return `signal#${r.id}`
}

function preview(value: unknown) {
  if (value === null) return "null"
  if (value === undefined) return "undefined"
  if (typeof value === "string") return value.length > 120 ? JSON.stringify(value.slice(0, 117) + "...") : JSON.stringify(value)
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") return String(value)
  if (typeof value === "symbol") return value.toString()
  if (typeof value === "function") return "[Function]"
  if (Array.isArray(value)) return `Array(${value.length})`
  if (value instanceof Map) return `Map(${value.size})`
  if (value instanceof Set) return `Set(${value.size})`
  if (value instanceof Date) return `Date(${Number.isFinite(value.valueOf()) ? value.toISOString() : "Invalid"})`
  if (value instanceof Error) return `${value.name}: ${value.message}`
  const ctor = (value as any)?.constructor?.name
  if (ctor && ctor !== "Object") return `${ctor}{...}`
  if (value && typeof value === "object") {
    const keys = Object.keys(value as any)
    if (!keys.length) return "Object{}"
    const head = keys.slice(0, 4)
    const tail = keys.length > head.length ? `,+${keys.length - head.length}` : ""
    return `Object{${head.join(",")}${tail}}`
  }
  return "{...}"
}

type TreeBuildNode = {
  id: string
  label: string
  variant: "group" | "item"
  meta?: string
  children: Map<string, TreeBuildNode>
  leafCount: number
}

function ensureChild(parent: TreeBuildNode, key: string, init: () => TreeBuildNode) {
  const hit = parent.children.get(key)
  if (hit) return hit
  const next = init()
  parent.children.set(key, next)
  return next
}

function toTreeItemNode(node: TreeBuildNode): TreeItem {
  const children = [...node.children.values()].sort((a, b) => a.label.localeCompare(b.label)).map(toTreeItemNode)
  return treeItem(node.id, node.label, {
    variant: node.variant,
    meta: node.meta,
    children: children.length ? children : undefined,
  })
}

function computeLeafCounts(node: TreeBuildNode): number {
  if (node.variant === "item") {
    node.leafCount = 1
    return 1
  }
  let sum = 0
  for (const child of node.children.values()) sum += computeLeafCounts(child)
  node.leafCount = sum
  node.meta = `${sum}`
  return sum
}

export function getStateTreeItems(records: DebugSignalRecord[] = listSignals()): TreeItem[] {
  const roots = new Map<string, TreeBuildNode>()

  for (const r of records) {
    const full = labelForSignal(r)
    const inferredScope = full.includes(".") ? full.split(".")[0]!.trim() : ""
    const scope = r.scope?.trim() || inferredScope || "unknown"
    const root = roots.get(scope) ?? (() => {
      const next: TreeBuildNode = { id: `scope:${scope}`, label: scope, variant: "group", children: new Map(), leafCount: 0 }
      roots.set(scope, next)
      return next
    })()

    const rawSegs = full.split(".").map((s) => s.trim()).filter(Boolean)
    const segs = rawSegs.length ? rawSegs : [full]
    let cur = root
    for (let i = 0; i < segs.length - 1; i++) {
      const prefix = segs.slice(0, i + 1).join(".")
      cur = ensureChild(cur, prefix, () => ({
        id: `prefix:${scope}:${prefix}`,
        label: segs[i]!,
        variant: "group",
        children: new Map(),
        leafCount: 0,
      }))
    }

    const leafLabel = segs[segs.length - 1]!
    const right = `${preview(r.peek())}${r.subscribers ? ` · ${r.subscribers}` : ""}`
    ensureChild(cur, `signal:${r.id}`, () => ({
      id: `signal:${r.id}`,
      label: leafLabel,
      variant: "item",
      meta: right,
      children: new Map(),
      leafCount: 1,
    }))
  }

  const items = [...roots.values()].sort((a, b) => a.label.localeCompare(b.label))
  for (const item of items) computeLeafCounts(item)
  return items.map(toTreeItemNode)
}
