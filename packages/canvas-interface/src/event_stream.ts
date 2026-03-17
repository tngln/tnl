export type Unsubscribe = () => void
export type EventListener<T> = (value: T) => void
export type TimerHandle = unknown
export type OperatorFunction<T, R> = (source: EventStream<T>) => EventStream<R>
type SubscriptionLike = { unsubscribe(): void }

export type Scheduler = {
  now(): number
  setTimer(fn: () => void, ms: number): TimerHandle
  clearTimer(handle: TimerHandle): void
}

export const defaultScheduler: Scheduler = {
  now: () => Date.now(),
  setTimer(fn, ms) {
    const handle = setTimeout(fn, ms)
    ;(handle as { unref?: () => void }).unref?.()
    return handle
  },
  clearTimer(handle) {
    clearTimeout(handle as ReturnType<typeof setTimeout>)
  },
}

export type InteractionCancelReason =
  | "leave"
  | "blur"
  | "visibility-hidden"
  | "pagehide"
  | "pointercancel"
  | "lost-capture"
  | "buttons-released"
  | "inactive"
  | "close"
  | "minimize"
  | "maximize"
  | "unmaximize"
  | "left-half"
  | "right-half"
  | "restore-screen-usage"
  | "set-rect"
  | (string & {})

export class EventStream<T> {
  private readonly subscribeImpl: (listener: EventListener<T>) => Unsubscribe | void

  constructor(subscribeImpl: (listener: EventListener<T>) => Unsubscribe | void) {
    this.subscribeImpl = subscribeImpl
  }

  subscribe(listener: EventListener<T>) {
    const unsubscribe = this.subscribeImpl(listener) ?? (() => {})
    return { unsubscribe }
  }

  pipe(): EventStream<T>
  pipe<A>(op1: OperatorFunction<T, A>): EventStream<A>
  pipe<A, B>(op1: OperatorFunction<T, A>, op2: OperatorFunction<A, B>): EventStream<B>
  pipe<A, B, C>(op1: OperatorFunction<T, A>, op2: OperatorFunction<A, B>, op3: OperatorFunction<B, C>): EventStream<C>
  pipe<A, B, C, D>(op1: OperatorFunction<T, A>, op2: OperatorFunction<A, B>, op3: OperatorFunction<B, C>, op4: OperatorFunction<C, D>): EventStream<D>
  pipe<A, B, C, D, E>(
    op1: OperatorFunction<T, A>,
    op2: OperatorFunction<A, B>,
    op3: OperatorFunction<B, C>,
    op4: OperatorFunction<C, D>,
    op5: OperatorFunction<D, E>,
  ): EventStream<E>
  pipe(...operators: Array<OperatorFunction<any, any>>): any {
    if (operators.length === 0) return this
    return operators.reduce((stream, operator) => operator(stream), this as EventStream<any>)
  }
}

function unsubscribeMany(subscriptions: SubscriptionLike[]): Unsubscribe {
  return () => {
    for (const subscription of subscriptions) subscription.unsubscribe()
  }
}

export function map<T, U>(project: (value: T) => U): OperatorFunction<T, U> {
  return (source) =>
    new EventStream<U>((listener) => source.subscribe((value) => listener(project(value))).unsubscribe)
}

export function filter<T>(predicate: (value: T) => boolean): OperatorFunction<T, T> {
  return (source) =>
    new EventStream<T>((listener) =>
      source.subscribe((value) => {
        if (predicate(value)) listener(value)
      }).unsubscribe,
    )
}

export function tap<T>(sideEffect: (value: T) => void): OperatorFunction<T, T> {
  return (source) =>
    new EventStream<T>((listener) =>
      source.subscribe((value) => {
        sideEffect(value)
        listener(value)
      }).unsubscribe,
    )
}

export function mergeWith<T, U>(other: EventStream<U>): OperatorFunction<T, T | U> {
  return (source) => mergeStreams(source, other)
}

export function takeUntil<T, U>(other: EventStream<U>): OperatorFunction<T, T> {
  return (source) =>
    new EventStream<T>((listener) => {
      let active = true
      const sourceSub = source.subscribe((value) => {
        if (active) listener(value)
      })
      const stopperSub = other.subscribe(() => {
        active = false
      })
      return unsubscribeMany([sourceSub, stopperSub])
    })
}

export function once<T>(): OperatorFunction<T, T> {
  return take(1)
}

export function take<T>(n: number): OperatorFunction<T, T> {
  return (source) =>
    new EventStream<T>((listener) => {
      let remaining = n
      if (remaining <= 0) return
      const sub = source.subscribe((value) => {
        if (remaining <= 0) return
        remaining--
        listener(value)
        if (remaining <= 0) sub.unsubscribe()
      })
      return sub.unsubscribe
    })
}

export function skip<T>(n: number): OperatorFunction<T, T> {
  return (source) =>
    new EventStream<T>((listener) => {
      let skipped = 0
      return source.subscribe((value) => {
        if (skipped < n) {
          skipped++
          return
        }
        listener(value)
      }).unsubscribe
    })
}

export function startWith<T>(value: T): OperatorFunction<T, T> {
  return (source) =>
    new EventStream<T>((listener) => {
      listener(value)
      return source.subscribe(listener).unsubscribe
    })
}

export function distinctUntilChanged<T>(eq?: (a: T, b: T) => boolean): OperatorFunction<T, T> {
  const isEqual = eq ?? ((a, b) => a === b)
  return (source) =>
    new EventStream<T>((listener) => {
      let hasPrev = false
      let prev: T
      return source.subscribe((value) => {
        if (hasPrev && isEqual(prev, value)) return
        hasPrev = true
        prev = value
        listener(value)
      }).unsubscribe
    })
}

export function scan<T, U>(reducer: (acc: U, value: T) => U, seed: U): OperatorFunction<T, U> {
  return (source) =>
    new EventStream<U>((listener) => {
      let acc = seed
      return source.subscribe((value) => {
        acc = reducer(acc, value)
        listener(acc)
      }).unsubscribe
    })
}

export function pairwise<T>(): OperatorFunction<T, [T, T]> {
  return (source) =>
    new EventStream<[T, T]>((listener) => {
      let hasPrev = false
      let prev: T
      return source.subscribe((value) => {
        if (hasPrev) listener([prev, value])
        hasPrev = true
        prev = value
      }).unsubscribe
    })
}

export function bufferCount<T>(size: number): OperatorFunction<T, T[]> {
  return (source) =>
    new EventStream<T[]>((listener) => {
      let buffer: T[] = []
      return source.subscribe((value) => {
        buffer.push(value)
        if (buffer.length >= size) {
          const batch = buffer
          buffer = []
          listener(batch)
        }
      }).unsubscribe
    })
}

export function withLatestFrom<T, U>(other: EventStream<U>): OperatorFunction<T, [T, U]> {
  return (source) =>
    new EventStream<[T, U]>((listener) => {
      let latest: { value: U } | null = null
      const otherSub = other.subscribe((value) => {
        latest = { value }
      })
      const sourceSub = source.subscribe((value) => {
        if (latest) listener([value, latest.value])
      })
      return unsubscribeMany([sourceSub, otherSub])
    })
}

export function sample<T>(notifier: EventStream<unknown>): OperatorFunction<T, T> {
  return (source) =>
    new EventStream<T>((listener) => {
      let latest: { value: T } | null = null
      const sourceSub = source.subscribe((value) => {
        latest = { value }
      })
      const notifierSub = notifier.subscribe(() => {
        if (latest) {
          listener(latest.value)
          latest = null
        }
      })
      return unsubscribeMany([sourceSub, notifierSub])
    })
}

export function switchMap<T, U>(project: (value: T) => EventStream<U>): OperatorFunction<T, U> {
  return (source) =>
    new EventStream<U>((listener) => {
      let innerSub: SubscriptionLike | null = null
      const outerSub = source.subscribe((value) => {
        innerSub?.unsubscribe()
        innerSub = project(value).subscribe(listener)
      })
      return () => {
        innerSub?.unsubscribe()
        outerSub.unsubscribe()
      }
    })
}

export function debounce<T>(ms: number, scheduler: Scheduler = defaultScheduler): OperatorFunction<T, T> {
  return (source) =>
    new EventStream<T>((listener) => {
      let timer: TimerHandle | null = null
      const sub = source.subscribe((value) => {
        if (timer !== null) scheduler.clearTimer(timer)
        timer = scheduler.setTimer(() => {
          timer = null
          listener(value)
        }, ms)
      })
      return () => {
        if (timer !== null) scheduler.clearTimer(timer)
        sub.unsubscribe()
      }
    })
}

export function throttle<T>(ms: number, scheduler: Scheduler = defaultScheduler): OperatorFunction<T, T> {
  return (source) =>
    new EventStream<T>((listener) => {
      let timer: TimerHandle | null = null
      let trailing: { value: T } | null = null
      const sub = source.subscribe((value) => {
        if (timer !== null) {
          trailing = { value }
          return
        }
        listener(value)
        timer = scheduler.setTimer(() => {
          timer = null
          if (trailing) {
            const current = trailing
            trailing = null
            listener(current.value)
            timer = scheduler.setTimer(() => {
              timer = null
            }, ms)
          }
        }, ms)
      })
      return () => {
        if (timer !== null) scheduler.clearTimer(timer)
        sub.unsubscribe()
      }
    })
}

export function audit<T>(ms: number, scheduler: Scheduler = defaultScheduler): OperatorFunction<T, T> {
  return (source) =>
    new EventStream<T>((listener) => {
      let timer: TimerHandle | null = null
      let latest: { value: T } | null = null
      const sub = source.subscribe((value) => {
        latest = { value }
        if (timer !== null) return
        timer = scheduler.setTimer(() => {
          timer = null
          if (latest) {
            const current = latest
            latest = null
            listener(current.value)
          }
        }, ms)
      })
      return () => {
        if (timer !== null) scheduler.clearTimer(timer)
        sub.unsubscribe()
      }
    })
}

export function delay<T>(ms: number, scheduler: Scheduler = defaultScheduler): OperatorFunction<T, T> {
  return (source) =>
    new EventStream<T>((listener) => {
      const pending: TimerHandle[] = []
      const sub = source.subscribe((value) => {
        const handle = scheduler.setTimer(() => {
          const idx = pending.indexOf(handle)
          if (idx >= 0) pending.splice(idx, 1)
          listener(value)
        }, ms)
        pending.push(handle)
      })
      return () => {
        for (const h of pending) scheduler.clearTimer(h)
        pending.length = 0
        sub.unsubscribe()
      }
    })
}

export function fromEvent<TEvent extends Event = Event>(
  target: {
    addEventListener(type: string, listener: ((event: Event) => void) | null, options?: boolean | AddEventListenerOptions): void
    removeEventListener(type: string, listener: ((event: Event) => void) | null, options?: boolean | EventListenerOptions): void
  },
  type: string,
  options?: boolean | AddEventListenerOptions,
): EventStream<TEvent> {
  return new EventStream<TEvent>((listener) => {
    const handler = (event: Event) => {
      listener(event as TEvent)
    }
    target.addEventListener(type, handler, options)
    return () => {
      target.removeEventListener(type, handler, options)
    }
  })
}

export type Emitter<T> = {
  stream: EventStream<T>
  emit(value: T): void
}

export function createEventStream<T>(): Emitter<T> {
  const listeners = new Set<EventListener<T>>()
  return {
    stream: new EventStream<T>((listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    }),
    emit(value: T) {
      for (const listener of [...listeners]) listener(value)
    },
  }
}

export function mergeStreams<A, B>(a: EventStream<A>, b: EventStream<B>) {
  return new EventStream<A | B>((listener) => {
    const sa = a.subscribe((value) => listener(value))
    const sb = b.subscribe((value) => listener(value))
    return () => {
      sa.unsubscribe()
      sb.unsubscribe()
    }
  })
}

export type ClickClassification<T> =
  | { kind: "single"; value: T }
  | { kind: "double"; first: T; second: T }

export function classifyClicks<T>(opts: {
  clicks: EventStream<T>
  windowMs: number
  canPair?: (first: T, second: T) => boolean
  scheduler?: Scheduler
}) {
  const { now, setTimer, clearTimer } = opts.scheduler ?? defaultScheduler

  return new EventStream<ClickClassification<T>>((listener) => {
    let pending: { value: T; at: number; timer: TimerHandle } | null = null

    const flushPending = () => {
      if (!pending) return
      const current = pending
      pending = null
      listener({ kind: "single", value: current.value })
    }

    const sub = opts.clicks.subscribe((value) => {
      const at = now()
      if (pending) {
        const withinWindow = at - pending.at <= opts.windowMs
        const pairable = opts.canPair ? opts.canPair(pending.value, value) : true
        if (withinWindow && pairable) {
          clearTimer(pending.timer)
          const first = pending.value
          pending = null
          listener({ kind: "double", first, second: value })
          return
        }
        clearTimer(pending.timer)
        flushPending()
      }

      const timer = setTimer(() => {
        flushPending()
      }, opts.windowMs)
      pending = { value, at, timer }
    })

    return () => {
      sub.unsubscribe()
      if (pending) {
        clearTimer(pending.timer)
        pending = null
      }
    }
  })
}

export function classifySpatialClicks<T extends { x: number; y: number }>(opts: {
  clicks: EventStream<T>
  windowMs: number
  distanceSq: number
  canPair?: (first: T, second: T) => boolean
  scheduler?: Scheduler
}) {
  const maxDistSq = Math.max(0, opts.distanceSq)
  return classifyClicks({
    clicks: opts.clicks,
    windowMs: opts.windowMs,
    canPair: (first, second) => {
      const dx = second.x - first.x
      const dy = second.y - first.y
      if (dx * dx + dy * dy > maxDistSq) return false
      return opts.canPair ? opts.canPair(first, second) : true
    },
    scheduler: opts.scheduler,
  })
}

/**
 * Detects sequential key chord sequences (VS Code style).
 * Emits when all `steps` predicates match in order, each pair of
 * consecutive steps within `windowMs` of each other.
 */
export function keyChordSequence<T>(opts: {
  keyDowns: EventStream<T>
  steps: ReadonlyArray<(event: T) => boolean>
  windowMs: number
  scheduler?: Scheduler
}): EventStream<readonly T[]> {
  if (opts.steps.length === 0) return new EventStream<readonly T[]>(() => {})
  const { setTimer, clearTimer } = opts.scheduler ?? defaultScheduler

  return new EventStream<readonly T[]>((listener) => {
    const matched: T[] = []
    let timer: TimerHandle | null = null

    const resetState = () => {
      if (timer !== null) {
        clearTimer(timer)
        timer = null
      }
      matched.length = 0
    }

    const startTimer = () => {
      if (timer !== null) clearTimer(timer)
      timer = setTimer(() => {
        timer = null
        matched.length = 0
      }, opts.windowMs)
    }

    const advance = (value: T) => {
      matched.push(value)
      if (matched.length === opts.steps.length) {
        const result = [...matched]
        resetState()
        listener(result)
        return
      }
      startTimer()
    }

    const sub = opts.keyDowns.subscribe((value) => {
      const cursor = matched.length
      if (opts.steps[cursor](value)) {
        advance(value)
      } else {
        resetState()
        if (cursor > 0 && opts.steps[0](value)) {
          advance(value)
        }
      }
    })

    return () => {
      resetState()
      sub.unsubscribe()
    }
  })
}

export type DragSessionEvent<TDown, TMove, TUp, TCancel> =
  | { kind: "start"; down: TDown; current: TMove }
  | { kind: "move"; down: TDown; current: TMove }
  | { kind: "end"; down: TDown; up: TUp }
  | { kind: "cancel"; down: TDown; reason: TCancel; started: boolean }

export function dragSession<TDown, TMove = TDown, TUp = TMove, TCancel = unknown>(opts: {
  down: EventStream<TDown>
  move: EventStream<TMove>
  up: EventStream<TUp>
  cancel?: EventStream<TCancel>
  point: (value: TDown | TMove) => { x: number; y: number }
  thresholdSq?: number
}) {
  const cancel = opts.cancel ?? createEventStream<TCancel>().stream
  const thresholdSq = Math.max(0, opts.thresholdSq ?? 0)

  return new EventStream<DragSessionEvent<TDown, TMove, TUp, TCancel>>((listener) => {
    let active: { down: TDown; started: boolean } | null = null

    const downSub = opts.down.subscribe((down) => {
      active = { down, started: false }
    })

    const moveSub = opts.move.subscribe((current) => {
      if (!active) return
      if (!active.started) {
        const startPoint = opts.point(active.down)
        const currentPoint = opts.point(current)
        const dx = currentPoint.x - startPoint.x
        const dy = currentPoint.y - startPoint.y
        if (dx * dx + dy * dy <= thresholdSq) return
        active.started = true
        listener({ kind: "start", down: active.down, current })
      }
      listener({ kind: "move", down: active.down, current })
    })

    const upSub = opts.up.subscribe((up) => {
      if (!active) return
      const current = active
      active = null
      if (!current.started) return
      listener({ kind: "end", down: current.down, up })
    })

    const cancelSub = cancel.subscribe((reason) => {
      if (!active) return
      const current = active
      active = null
      listener({ kind: "cancel", down: current.down, reason, started: current.started })
    })

    return () => {
      downSub.unsubscribe()
      moveSub.unsubscribe()
      upSub.unsubscribe()
      cancelSub.unsubscribe()
      active = null
    }
  })
}

export function pointerDragSession<TDown extends { x: number; y: number }, TMove extends { x: number; y: number; buttons: number }, TUp = TMove>(opts: {
  down: EventStream<TDown>
  move: EventStream<TMove>
  up: EventStream<TUp>
  cancel?: EventStream<InteractionCancelReason>
  thresholdSq?: number
  primaryButtonMask?: number
}) {
  const dragMoves = opts.move.pipe(
    filter((value) => ((value.buttons & (opts.primaryButtonMask ?? 1)) !== 0)),
  )
  const cancel = interactionCancelStream({
    cancel: opts.cancel,
    move: opts.move,
    buttons: (value) => value.buttons,
    primaryButtonMask: opts.primaryButtonMask,
  })

  return dragSession<TDown, TMove, TUp, InteractionCancelReason>({
    down: opts.down,
    move: dragMoves,
    up: opts.up,
    cancel,
    point: (value) => ({ x: value.x, y: value.y }),
    thresholdSq: opts.thresholdSq,
  })
}

export function interactionCancelStream<TMove>(opts: {
  cancel?: EventStream<InteractionCancelReason>
  interrupted?: EventStream<InteractionCancelReason>
  move?: EventStream<TMove>
  buttons?: (value: TMove) => number
  primaryButtonMask?: number
}) {
  let out: EventStream<InteractionCancelReason> | null = null
  if (opts.cancel) out = opts.cancel
  if (opts.interrupted) out = out ? out.pipe(mergeWith(opts.interrupted)) : opts.interrupted
  if (opts.move && opts.buttons) {
    const primaryButtonMask = opts.primaryButtonMask ?? 1
    const released = opts.move.pipe(
      filter((value) => (((opts.buttons?.(value) ?? 0) & primaryButtonMask) === 0)),
      map(() => "buttons-released" as InteractionCancelReason),
    )
    out = out ? out.pipe(mergeWith(released)) : released
  }
  return out ?? createEventStream<InteractionCancelReason>().stream
}
