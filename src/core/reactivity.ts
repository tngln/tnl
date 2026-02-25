export type EffectCleanup = void | (() => void)

type EffectFn = (() => EffectCleanup) & { deps?: Set<Signal<unknown>>; cleanup?: EffectCleanup }

let activeEffect: EffectFn | null = null
const effectStack: EffectFn[] = []

export type Signal<T> = {
  get(): T
  set(next: T | ((prev: T) => T)): void
  peek(): T
}

export function signal<T>(initial: T): Signal<T> {
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

  ;(sig as Signal<unknown>).get = sig.get
  ;(sig as Signal<unknown>).set = sig.set
  ;(sig as Signal<unknown>).peek = sig.peek

  ;(sig as any)._subs = subs

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

