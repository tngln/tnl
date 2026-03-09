export type Unsubscribe = () => void
export type EventListener<T> = (value: T) => void
export type TimerHandle = unknown
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

  map<U>(project: (value: T) => U) {
    return new EventStream<U>((listener) => this.subscribe((value) => listener(project(value))).unsubscribe)
  }

  filter(predicate: (value: T) => boolean) {
    return new EventStream<T>((listener) =>
      this.subscribe((value) => {
        if (predicate(value)) listener(value)
      }).unsubscribe,
    )
  }

  tap(sideEffect: (value: T) => void) {
    return new EventStream<T>((listener) =>
      this.subscribe((value) => {
        sideEffect(value)
        listener(value)
      }).unsubscribe,
    )
  }

  merge<U>(other: EventStream<U>) {
    return mergeStreams(this, other)
  }

  takeUntil<U>(other: EventStream<U>) {
    return new EventStream<T>((listener) => {
      let active = true
      const source = this.subscribe((value) => {
        if (active) listener(value)
      })
      const stopper = other.subscribe(() => {
        active = false
      })
      return () => {
        source.unsubscribe()
        stopper.unsubscribe()
      }
    })
  }

  once() {
    return new EventStream<T>((listener) => {
      let active = true
      const sub = this.subscribe((value) => {
        if (!active) return
        active = false
        listener(value)
        sub.unsubscribe()
      })
      return () => {
        active = false
        sub.unsubscribe()
      }
    })
  }
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
  now?: () => number
  setTimer?: (fn: () => void, ms: number) => TimerHandle
  clearTimer?: (handle: TimerHandle) => void
}) {
  const now = opts.now ?? (() => Date.now())
  const setTimer =
    opts.setTimer ??
    ((fn: () => void, ms: number) => {
      const handle = setTimeout(fn, ms)
      ;(handle as { unref?: () => void }).unref?.()
      return handle
    })
  const clearTimer = opts.clearTimer ?? ((handle: TimerHandle) => clearTimeout(handle as ReturnType<typeof setTimeout>))

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

export function interactionCancelStream<TMove>(opts: {
  cancel?: EventStream<InteractionCancelReason>
  interrupted?: EventStream<InteractionCancelReason>
  move?: EventStream<TMove>
  buttons?: (value: TMove) => number
  primaryButtonMask?: number
}) {
  let out: EventStream<InteractionCancelReason> | null = null
  if (opts.cancel) out = opts.cancel
  if (opts.interrupted) out = out ? out.merge(opts.interrupted) : opts.interrupted
  if (opts.move && opts.buttons) {
    const primaryButtonMask = opts.primaryButtonMask ?? 1
    const released = opts.move
      .filter((value) => (((opts.buttons?.(value) ?? 0) & primaryButtonMask) === 0))
      .map(() => "buttons-released" as InteractionCancelReason)
    out = out ? out.merge(released) : released
  }
  return out ?? createEventStream<InteractionCancelReason>().stream
}

export function untilAbort(signalLike: { subscribe(listener: () => void): { unsubscribe(): void } }) {
  return new EventStream<void>((listener) => {
    const sub = signalLike.subscribe(listener)
    return () => sub.unsubscribe()
  })
}
