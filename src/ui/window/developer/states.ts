import { listSignals, type DebugSignalRecord } from "../../../core/reactivity"

export type DataNode =
  | { kind: "group"; id: string; label: string; count: number; children: DataNode[] }
  | { kind: "signal"; id: string; label: string; valuePreview: string; subscribers: number }

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
  return "{...}"
}

export function getStateTree(records: DebugSignalRecord[] = listSignals()): DataNode[] {
  const byScope = new Map<string, DebugSignalRecord[]>()
  for (const r of records) {
    const scope = r.scope?.trim() || "unknown"
    const list = byScope.get(scope)
    if (list) list.push(r)
    else byScope.set(scope, [r])
  }

  const scopes = [...byScope.keys()].sort((a, b) => a.localeCompare(b))
  const roots: DataNode[] = []

  for (const scope of scopes) {
    const list = byScope.get(scope) ?? []
    list.sort((a, b) => labelForSignal(a).localeCompare(labelForSignal(b)) || a.id - b.id)
    const children: DataNode[] = list.map((r) => {
      return {
        kind: "signal",
        id: `signal:${r.id}`,
        label: labelForSignal(r),
        valuePreview: preview(r.peek()),
        subscribers: r.subscribers,
      }
    })
    roots.push({ kind: "group", id: `scope:${scope}`, label: scope, count: list.length, children })
  }

  return roots
}
