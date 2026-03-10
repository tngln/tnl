export type DebugLevel = "silent" | "error" | "warn" | "info" | "debug" | "trace"

export type DebugEntry = {
  id: number
  at: number
  level: DebugLevel
  scope: string
  message: string
  details?: unknown
}

const DEBUG_LEVEL_ORDER: Record<DebugLevel, number> = {
  silent: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
  trace: 5,
}

const DEBUG_STORAGE_KEY = "tnl.debug.level"
const DEBUG_HISTORY_LIMIT = 200
const DEFAULT_DEBUG_LEVEL: DebugLevel = "info"

let nextEntryId = 1
let currentLevel = readInitialDebugLevel()
const history: DebugEntry[] = []
const listeners = new Set<(entry: DebugEntry) => void>()

export function parseDebugLevel(value: unknown): DebugLevel | null {
  if (typeof value !== "string") return null
  const normalized = value.trim().toLowerCase()
  return normalized in DEBUG_LEVEL_ORDER ? (normalized as DebugLevel) : null
}

export function getDebugLevel() {
  return currentLevel
}

export function shouldLog(level: DebugLevel) {
  return DEBUG_LEVEL_ORDER[level] <= DEBUG_LEVEL_ORDER[currentLevel] && currentLevel !== "silent"
}

export function setDebugLevel(level: DebugLevel, opts: { persist?: boolean } = {}) {
  currentLevel = level
  if (opts.persist !== false) writeStoredDebugLevel(level)
  emitInternal({
    level: "info",
    scope: "debug",
    message: `Debug level set to ${level}`,
  })
  return currentLevel
}

export function subscribeDebugEntries(listener: (entry: DebugEntry) => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function listDebugEntries(opts: { limit?: number; scopePrefix?: string | string[]; minLevel?: DebugLevel } = {}) {
  const prefixes = Array.isArray(opts.scopePrefix)
    ? opts.scopePrefix.filter((value) => value.length > 0)
    : opts.scopePrefix
      ? [opts.scopePrefix]
      : []
  const minLevel = opts.minLevel ?? "trace"
  const filtered = history.filter((entry) => {
    if (DEBUG_LEVEL_ORDER[entry.level] > DEBUG_LEVEL_ORDER[minLevel]) return false
    if (!prefixes.length) return true
    return prefixes.some((prefix) => entry.scope === prefix || entry.scope.startsWith(`${prefix}.`))
  })
  const limit = Math.max(0, opts.limit ?? filtered.length)
  return limit >= filtered.length ? [...filtered] : filtered.slice(filtered.length - limit)
}

export function logDebug(level: Exclude<DebugLevel, "silent">, scope: string, message: string, details?: unknown) {
  return emitInternal({ level, scope, message, details })
}

export function createLogger(scope: string) {
  return {
    error(message: string, details?: unknown) {
      return logDebug("error", scope, message, details)
    },
    warn(message: string, details?: unknown) {
      return logDebug("warn", scope, message, details)
    },
    info(message: string, details?: unknown) {
      return logDebug("info", scope, message, details)
    },
    debug(message: string, details?: unknown) {
      return logDebug("debug", scope, message, details)
    },
    trace(message: string, details?: unknown) {
      return logDebug("trace", scope, message, details)
    },
  }
}

function emitInternal(args: Omit<DebugEntry, "id" | "at">) {
  const entry: DebugEntry = {
    id: nextEntryId++,
    at: Date.now(),
    ...args,
  }
  history.push(entry)
  if (history.length > DEBUG_HISTORY_LIMIT) history.splice(0, history.length - DEBUG_HISTORY_LIMIT)
  if (shouldLog(entry.level)) writeConsole(entry)
  for (const listener of listeners) listener(entry)
  attachDevtoolsApi()
  return entry
}

function writeConsole(entry: DebugEntry) {
  const prefix = `[tnl][${entry.level}][${entry.scope}] ${entry.message}`
  const consoleLike = globalThis.console
  const method = entry.level === "error"
    ? consoleLike.error
    : entry.level === "warn"
      ? consoleLike.warn
      : entry.level === "debug" || entry.level === "trace"
        ? consoleLike.debug
        : consoleLike.info
  if (!entry.details || entry.details === undefined) {
    method.call(consoleLike, prefix)
    return
  }
  method.call(consoleLike, prefix, entry.details)
}

function readInitialDebugLevel(): DebugLevel {
  const globalLevel = parseDebugLevel((globalThis as { __TNL_DEBUG_LEVEL__?: unknown }).__TNL_DEBUG_LEVEL__)
  if (globalLevel) return globalLevel
  const storedLevel = parseDebugLevel(readStoredDebugLevel())
  return storedLevel ?? DEFAULT_DEBUG_LEVEL
}

function readStoredDebugLevel() {
  try {
    return globalThis.localStorage?.getItem(DEBUG_STORAGE_KEY) ?? null
  } catch {
    return null
  }
}

function writeStoredDebugLevel(level: DebugLevel) {
  try {
    globalThis.localStorage?.setItem(DEBUG_STORAGE_KEY, level)
  } catch {
    // Ignore storage write failures.
  }
}

function attachDevtoolsApi() {
  const globalWithDevtools = globalThis as { __TNL_DEVTOOLS__?: Record<string, unknown> }
  globalWithDevtools.__TNL_DEVTOOLS__ ??= {}
  globalWithDevtools.__TNL_DEVTOOLS__.debug = {
    getLevel: () => currentLevel,
    setLevel: (level: DebugLevel) => setDebugLevel(level),
    list: (opts?: Parameters<typeof listDebugEntries>[0]) => listDebugEntries(opts),
  }
}

attachDevtoolsApi()