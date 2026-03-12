export type EffectCleanup = void | (() => void)

type EffectFn = (() => EffectCleanup) & { deps?: Set<Signal<unknown>>; cleanup?: EffectCleanup }

let activeEffect: EffectFn | null = null
const effectStack: EffectFn[] = []
let nextSignalId = 1
const debugSignals = new Map<number, Signal<unknown>>()
const debugMeta = new Map<number, { name?: string; debugLabel?: string; scope?: string; hidden?: boolean; createdAt: number; createdStack?: string }>()

export type Signal<T> = {
  get(): T
  set(next: T | ((prev: T) => T)): void
  peek(): T
}

export type DebugSignalRecord = {
  id: number
  name?: string
  debugLabel?: string
  scope?: string
  createdAt: number
  createdStack?: string
  subscribers: number
  peek: () => unknown
}

export function listSignals(): DebugSignalRecord[] {
  const out: DebugSignalRecord[] = []
  for (const [id, sig] of debugSignals) {
    const meta = debugMeta.get(id)
    if (meta?.hidden) continue
    const subs: Set<EffectFn> | undefined = (sig as any)._subs
    out.push({
      id,
      name: meta?.name,
      debugLabel: meta?.debugLabel,
      scope: meta?.scope,
      createdAt: meta?.createdAt ?? 0,
      createdStack: meta?.createdStack,
      subscribers: subs?.size ?? 0,
      peek: () => sig.peek(),
    })
  }
  return out
}

export function setSignalMeta(sig: Signal<unknown>, meta: { name?: string; debugLabel?: string; scope?: string; hidden?: boolean }) {
  const id: number | undefined = (sig as any)._id
  if (!id) return
  const cur = debugMeta.get(id) ?? { createdAt: Date.now() }
  debugMeta.set(id, {
    createdAt: cur.createdAt,
    name: meta.name ?? cur.name,
    debugLabel: meta.debugLabel ?? cur.debugLabel,
    scope: meta.scope ?? cur.scope,
    hidden: meta.hidden ?? cur.hidden,
    createdStack: cur.createdStack,
  })
}

export function signal<T>(initial: T, opts: { debugLabel: string } | { debugLabel?: string } = {}): Signal<T> {
  let value = initial
  const subs = new Set<EffectFn>()

  function track() {
    if (!activeEffect) return
    subs.add(activeEffect)
    activeEffect.deps ??= new Set()
    activeEffect.deps.add(sig as Signal<unknown>)
  }

  function notify() {
    for (const sub of [...subs]) sub()
  }

  const sig: Signal<T> = {
    get() {
      track()
      return value
    },
    peek() {
      return value
    },
    set(next) {
      const nextValue = typeof next === "function" ? (next as (p: T) => T)(value) : next
      if (Object.is(nextValue, value)) return
      value = nextValue
      notify()
    },
  }

  ;(sig as any)._subs = subs
  const id = nextSignalId++
  ;(sig as any)._id = id
  debugSignals.set(id, sig as Signal<unknown>)
  const stack = new Error().stack
  debugMeta.set(id, { createdAt: Date.now(), debugLabel: opts.debugLabel, createdStack: stack })

  return sig
}

function cleanupEffect(eff: EffectFn) {
  if (eff.cleanup) {
    const c = eff.cleanup
    eff.cleanup = undefined
    if (typeof c === "function") c()
  }
  if (!eff.deps) return
  for (const dep of eff.deps) {
    const subs: Set<EffectFn> | undefined = (dep as any)._subs
    subs?.delete(eff)
  }
  eff.deps.clear()
}

export function effect(fn: () => EffectCleanup): () => void {
  const runner: EffectFn = (() => {
    cleanupEffect(runner)
    activeEffect = runner
    effectStack.push(runner)
    try {
      runner.cleanup = fn() ?? undefined
    } finally {
      effectStack.pop()
      activeEffect = effectStack.length ? effectStack[effectStack.length - 1] : null
    }
  }) as EffectFn

  runner()
  return () => cleanupEffect(runner)
}

export function computed<T>(fn: () => T): Signal<T> {
  const out = signal<T>(undefined as unknown as T)
  effect(() => {
    out.set(fn())
  })
  return out
}

const g = globalThis as any
g.__TNL_DEVTOOLS__ ??= {}
g.__TNL_DEVTOOLS__.reactivity = { listSignals, setSignalMeta }
