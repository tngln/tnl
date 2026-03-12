export function baseName(path: string) {
  const i = path.lastIndexOf("/")
  return i >= 0 ? path.slice(i + 1) : path
}

export function baseNameOr(path: string | null | undefined, fallback: string) {
  if (!path) return fallback
  return baseName(path)
}

export function dirName(path: string) {
  const i = path.lastIndexOf("/")
  return i >= 0 ? path.slice(0, i) : ""
}

export function formatBytes(bytes: number) {
  const b = Math.max(0, bytes)
  if (b < 1024) return `${b} B`
  const units = ["KB", "MB", "GB", "TB"] as const
  let n = b / 1024
  let u = 0
  while (n >= 1024 && u < units.length - 1) {
    n /= 1024
    u++
  }
  const digits = n < 10 ? 2 : n < 100 ? 1 : 0
  return `${n.toFixed(digits)} ${units[u]}`
}

export function formatLocalTime(ts: number) {
  if (!Number.isFinite(ts) || ts <= 0) return "-"
  try {
    return new Date(ts).toLocaleString()
  } catch {
    return String(ts)
  }
}

export function collectIds<T extends { id: string; children?: T[] }>(items: T[], ids: Set<string>) {
  for (const item of items) {
    ids.add(item.id)
    if (item.children?.length) collectIds(item.children, ids)
  }
}

