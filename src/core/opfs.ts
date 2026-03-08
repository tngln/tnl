import { estimateStorageUsage, getOpfsRootDirectory } from "../platform/web/opfs"

export type OpfsErrorCode = "NotFound" | "AlreadyExists" | "InvalidPath" | "DbCorrupted" | "PermissionDenied" | "Unsupported" | "Unknown"

export class OpfsError extends Error {
  readonly code: OpfsErrorCode
  constructor(code: OpfsErrorCode, message: string, cause?: unknown) {
    super(message)
    this.code = code
    ;(this as any).cause = cause
  }
}

export type OpfsEntryV1 = {
  id: string
  path: string
  name: string
  type: string
  size: number
  createdAt: number
  updatedAt: number
  extras?: Record<string, unknown>
  checksum?: string
}

export type OpfsDbV1 = {
  version: 1
  updatedAt: number
  entries: Record<string, OpfsEntryV1>
}

export function normalizePath(input: string) {
  const raw = (input ?? "").trim()
  if (!raw) throw new OpfsError("InvalidPath", "Path is empty")
  if (raw.startsWith("/")) throw new OpfsError("InvalidPath", "Path must be relative")
  const parts = raw.split("/").filter((p) => p.length > 0)
  const out: string[] = []
  for (const p of parts) {
    if (p === ".") continue
    if (p === "..") throw new OpfsError("InvalidPath", "Path traversal is not allowed")
    out.push(p)
  }
  if (!out.length) throw new OpfsError("InvalidPath", "Path resolves to empty")
  return out.join("/")
}

function baseName(path: string) {
  const i = path.lastIndexOf("/")
  return i >= 0 ? path.slice(i + 1) : path
}

function dirName(path: string) {
  const i = path.lastIndexOf("/")
  return i >= 0 ? path.slice(0, i) : ""
}

function isDomErr(e: unknown) {
  return typeof DOMException !== "undefined" && e instanceof DOMException
}

function toOpfsError(e: unknown, fallback: OpfsError) {
  if (isDomErr(e)) {
    const name = (e as DOMException).name
    if (name === "NotFoundError") return new OpfsError("NotFound", fallback.message, e)
    if (name === "NotAllowedError" || name === "SecurityError") return new OpfsError("PermissionDenied", fallback.message, e)
  }
  return fallback
}

function randomId() {
  const c = globalThis as any
  const uuid = c?.crypto?.randomUUID
  if (typeof uuid === "function") return uuid.call(c.crypto)
  const r = () => Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, "0")
  return `${r()}${r()}-${r()}-${r()}-${r()}-${r()}${r()}${r()}`
}

class Mutex {
  private tail: Promise<void> = Promise.resolve()
  run<T>(fn: () => Promise<T>) {
    const next = this.tail.then(fn, fn)
    this.tail = next.then(
      () => undefined,
      () => undefined,
    )
    return next
  }
}

const DB_FILE = ".tnl-db.json"
const DB_TMP_FILE = ".tnl-db.json.tmp"

function emptyDb(): OpfsDbV1 {
  return { version: 1, updatedAt: Date.now(), entries: {} }
}

function parseDb(text: string): OpfsDbV1 {
  let j: any
  try {
    j = JSON.parse(text)
  } catch (e) {
    throw new OpfsError("DbCorrupted", "Database JSON parse failed", e)
  }
  if (!j || j.version !== 1 || typeof j.entries !== "object") throw new OpfsError("DbCorrupted", "Database schema mismatch")
  return { version: 1, updatedAt: typeof j.updatedAt === "number" ? j.updatedAt : Date.now(), entries: j.entries as Record<string, OpfsEntryV1> }
}

async function readTextFile(dir: FileSystemDirectoryHandle, name: string) {
  try {
    const h = await dir.getFileHandle(name, { create: false })
    const f = await h.getFile()
    return await f.text()
  } catch (e) {
    if (isDomErr(e) && (e as DOMException).name === "NotFoundError") return null
    throw e
  }
}

async function writeTextFile(dir: FileSystemDirectoryHandle, name: string, text: string) {
  const h = await dir.getFileHandle(name, { create: true })
  const w = await h.createWritable({ keepExistingData: false } as any)
  await w.write(text)
  await w.close()
}

async function removeIfExists(dir: FileSystemDirectoryHandle, name: string) {
  try {
    await dir.removeEntry(name)
  } catch (e) {
    if (isDomErr(e) && (e as DOMException).name === "NotFoundError") return
    throw e
  }
}

async function getDir(root: FileSystemDirectoryHandle, path: string, create: boolean) {
  const dir = dirName(path)
  if (!dir) return root
  const parts = dir.split("/").filter((p) => p.length)
  let cur = root
  for (const p of parts) cur = await cur.getDirectoryHandle(p, { create })
  return cur
}

async function getFileHandle(root: FileSystemDirectoryHandle, path: string, create: boolean) {
  const dir = await getDir(root, path, create)
  const name = baseName(path)
  const h = await dir.getFileHandle(name, { create })
  return { dir, name, handle: h }
}

function byPath(db: OpfsDbV1) {
  const map = new Map<string, OpfsEntryV1>()
  for (const e of Object.values(db.entries)) map.set(e.path, e)
  return map
}

function ensureUniquePath(db: OpfsDbV1) {
  const seen = new Set<string>()
  for (const e of Object.values(db.entries)) {
    if (seen.has(e.path)) throw new OpfsError("DbCorrupted", "Duplicate path in database")
    seen.add(e.path)
  }
}

export class OpfsFs {
  private readonly root: FileSystemDirectoryHandle
  private db: OpfsDbV1
  private readonly lock = new Mutex()

  private constructor(root: FileSystemDirectoryHandle, db: OpfsDbV1) {
    this.root = root
    this.db = db
  }

  static async open() {
    try {
      const root = await getOpfsRootDirectory()
      const db = await loadDb(root)
      return new OpfsFs(root, db)
    } catch (e) {
      if (e instanceof Error && e.message === "OPFS is not available in this environment") {
        throw new OpfsError("Unsupported", e.message, e)
      }
      throw e
    }
  }

  close() {}

  async writeFile(
    path: string,
    data: Blob | ArrayBuffer | Uint8Array,
    meta: { type?: string; extras?: Record<string, unknown> } = {},
  ): Promise<OpfsEntryV1> {
    const p = normalizePath(path)
    return this.lock.run(async () => {
      const blob =
        data instanceof Blob
          ? data
          : data instanceof Uint8Array
            ? (() => {
                const copy = new Uint8Array(data.byteLength)
                copy.set(data)
                return new Blob([copy])
              })()
            : new Blob([data])
      const type = meta.type ?? (blob.type || "application/octet-stream")
      let file: File
      try {
        const { handle } = await getFileHandle(this.root, p, true)
        const w = await handle.createWritable({ keepExistingData: false } as any)
        await w.write(blob)
        await w.close()
        file = await handle.getFile()
      } catch (e) {
        throw toOpfsError(e, new OpfsError("Unknown", `Failed to write file: ${p}`, e))
      }

      const now = Date.now()
      const map = byPath(this.db)
      const prev = map.get(p)
      const id = prev?.id ?? randomId()
      const createdAt = prev?.createdAt ?? now
      const entry: OpfsEntryV1 = {
        id,
        path: p,
        name: baseName(p),
        type: prev?.type ?? type,
        size: file.size,
        createdAt,
        updatedAt: now,
        extras: meta.extras ?? prev?.extras,
        checksum: prev?.checksum,
      }
      this.db.entries[id] = entry
      if (prev && prev.id !== id) delete this.db.entries[prev.id]
      for (const [k, v] of Object.entries(this.db.entries)) {
        if (k !== id && v.path === p) delete this.db.entries[k]
      }
      await flushDb(this.root, this.db)
      return entry
    })
  }

  async readFile(path: string): Promise<Blob> {
    const p = normalizePath(path)
    return this.lock.run(async () => {
      try {
        const { handle } = await getFileHandle(this.root, p, false)
        const f = await handle.getFile()
        return f
      } catch (e) {
        throw toOpfsError(e, new OpfsError("NotFound", `File not found: ${p}`, e))
      }
    })
  }

  async stat(path: string): Promise<OpfsEntryV1 | null> {
    const p = normalizePath(path)
    return this.lock.run(async () => {
      const map = byPath(this.db)
      const entry = map.get(p) ?? null
      if (!entry) return null
      try {
        const { handle } = await getFileHandle(this.root, p, false)
        const f = await handle.getFile()
        if (f.size !== entry.size) {
          entry.size = f.size
          entry.updatedAt = Date.now()
          this.db.entries[entry.id] = entry
          await flushDb(this.root, this.db)
        }
      } catch (e) {
        return null
      }
      return entry
    })
  }

  async list(prefix?: string): Promise<OpfsEntryV1[]> {
    const pref = prefix ? normalizePath(prefix).replace(/\/+$/, "") : ""
    return this.lock.run(async () => {
      const entries = Object.values(this.db.entries)
      if (!pref) return entries.slice().sort((a, b) => a.path.localeCompare(b.path))
      const withSlash = pref + "/"
      return entries
        .filter((e) => e.path === pref || e.path.startsWith(withSlash))
        .slice()
        .sort((a, b) => a.path.localeCompare(b.path))
    })
  }

  async delete(path: string): Promise<void> {
    const p = normalizePath(path)
    return this.lock.run(async () => {
      const map = byPath(this.db)
      const entry = map.get(p)
      if (!entry) throw new OpfsError("NotFound", `File not found: ${p}`)
      try {
        const { dir, name } = await getFileHandle(this.root, p, false)
        await dir.removeEntry(name)
      } catch (e) {
        throw toOpfsError(e, new OpfsError("Unknown", `Failed to delete file: ${p}`, e))
      }
      delete this.db.entries[entry.id]
      await flushDb(this.root, this.db)
    })
  }

  async move(from: string, to: string): Promise<void> {
    const src = normalizePath(from)
    const dst = normalizePath(to)
    return this.lock.run(async () => {
      const map = byPath(this.db)
      const entry = map.get(src)
      if (!entry) throw new OpfsError("NotFound", `File not found: ${src}`)
      if (map.get(dst)) throw new OpfsError("AlreadyExists", `Target already exists: ${dst}`)

      let blob: Blob
      try {
        const { handle } = await getFileHandle(this.root, src, false)
        blob = await handle.getFile()
      } catch (e) {
        throw toOpfsError(e, new OpfsError("NotFound", `File not found: ${src}`, e))
      }

      try {
        const { handle } = await getFileHandle(this.root, dst, true)
        const w = await handle.createWritable({ keepExistingData: false } as any)
        await w.write(blob)
        await w.close()
      } catch (e) {
        throw toOpfsError(e, new OpfsError("Unknown", `Failed to move file to: ${dst}`, e))
      }

      try {
        const { dir, name } = await getFileHandle(this.root, src, false)
        await dir.removeEntry(name)
      } catch (e) {
        throw toOpfsError(e, new OpfsError("Unknown", `Failed to remove source file: ${src}`, e))
      }

      const now = Date.now()
      entry.path = dst
      entry.name = baseName(dst)
      entry.updatedAt = now
      this.db.entries[entry.id] = entry
      await flushDb(this.root, this.db)
    })
  }

  async updateMeta(path: string, patch: { type?: string; extras?: Record<string, unknown> }): Promise<OpfsEntryV1> {
    const p = normalizePath(path)
    return this.lock.run(async () => {
      const map = byPath(this.db)
      const entry = map.get(p)
      if (!entry) throw new OpfsError("NotFound", `File not found: ${p}`)
      const next: OpfsEntryV1 = {
        ...entry,
        type: patch.type ?? entry.type,
        extras: patch.extras ?? entry.extras,
        updatedAt: Date.now(),
      }
      this.db.entries[next.id] = next
      await flushDb(this.root, this.db)
      return next
    })
  }

  async getUsage(): Promise<{ entries: number; bytes: number; quota?: number; usage?: number }> {
    return this.lock.run(async () => {
      const entries = Object.values(this.db.entries)
      const bytes = entries.reduce((s, e) => s + (Number.isFinite(e.size) ? e.size : 0), 0)
      try {
        const r = await estimateStorageUsage()
        if (!r) return { entries: entries.length, bytes }
        return { entries: entries.length, bytes, quota: r?.quota, usage: r?.usage }
      } catch {
        return { entries: entries.length, bytes }
      }
    })
  }
}

export async function openOpfs() {
  return OpfsFs.open()
}

async function loadDb(root: FileSystemDirectoryHandle): Promise<OpfsDbV1> {
  const main = await readTextFile(root, DB_FILE)
  const tmp = await readTextFile(root, DB_TMP_FILE)
  if (main) {
    try {
      const db = parseDb(main)
      ensureUniquePath(db)
      return db
    } catch (e) {
      if (tmp) {
        const db = parseDb(tmp)
        ensureUniquePath(db)
        return db
      }
      throw e
    }
  }
  if (tmp) {
    const db = parseDb(tmp)
    ensureUniquePath(db)
    return db
  }
  const db = emptyDb()
  await flushDb(root, db)
  return db
}

async function flushDb(root: FileSystemDirectoryHandle, db: OpfsDbV1) {
  db.updatedAt = Date.now()
  ensureUniquePath(db)
  const text = JSON.stringify(db)
  try {
    await writeTextFile(root, DB_TMP_FILE, text)
    await writeTextFile(root, DB_FILE, text)
    await removeIfExists(root, DB_TMP_FILE)
  } catch (e) {
    throw toOpfsError(e, new OpfsError("Unknown", "Failed to persist database", e))
  }
}
