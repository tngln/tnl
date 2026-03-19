import { effect, setSignalMeta, signal, type Signal } from "../reactivity"

export type MachineSnapshot<State extends string, Context> = {
  state: State
  context: Context
}

export type TransitionResult<State extends string, Context> = {
  changed: boolean
  previous: MachineSnapshot<State, Context>
  current: MachineSnapshot<State, Context>
}

type MachineEvent = { type: string }

export type MachineTransition<State extends string, Event extends MachineEvent, Context> = {
  target?: State
  guard?: (snapshot: MachineSnapshot<State, Context>, event: Event) => boolean
  reduce?: (snapshot: MachineSnapshot<State, Context>, event: Event) => Partial<Context> | Context
  effect?: (snapshot: MachineSnapshot<State, Context>, event: Event, next: MachineSnapshot<State, Context>) => void
}

type MachineTransitionMap<State extends string, Event extends MachineEvent, Context> = {
  [K in Event["type"]]?: MachineTransition<State, Extract<Event, { type: K }>, Context>
}

export type MachineConfig<State extends string, Event extends MachineEvent, Context> = {
  initial: State
  context: Context
  states: Record<State, { on?: Partial<MachineTransitionMap<State, Event, Context>> }>
  debug?: {
    name?: string
    scope?: string
    hidden?: boolean
  }
}

export type Machine<State extends string, Event extends MachineEvent, Context> = {
  snapshot(): MachineSnapshot<State, Context>
  signal(): Signal<MachineSnapshot<State, Context>>
  subscribe(listener: (snapshot: MachineSnapshot<State, Context>) => void): { unsubscribe(): void }
  send(event: Event): TransitionResult<State, Context>
  can(event: Event): boolean
  matches(state: State): boolean
  reset(): TransitionResult<State, Context>
}

export type PressState = "idle" | "pressed"
export type PressContext = {
  originPointer: { x: number; y: number }
  lastPointer: { x: number; y: number }
}
export type PressEvent =
  | { type: "PRESS"; point: { x: number; y: number } }
  | { type: "RELEASE"; point: { x: number; y: number } }
  | { type: "CANCEL"; reason: string }

function cloneContext<Context extends object>(context: Context): Context {
  return { ...context }
}

function cloneSnapshot<State extends string, Context extends object>(snapshot: MachineSnapshot<State, Context>): MachineSnapshot<State, Context> {
  return {
    state: snapshot.state,
    context: cloneContext(snapshot.context),
  }
}

export function createMachine<State extends string, Event extends MachineEvent, Context extends object>(
  config: MachineConfig<State, Event, Context>,
): Machine<State, Event, Context> {
  const initialSnapshot: MachineSnapshot<State, Context> = {
    state: config.initial,
    context: cloneContext(config.context),
  }
  const stateSignal = signal<MachineSnapshot<State, Context>>(initialSnapshot, { debugLabel: config.debug?.name ? `fsm.${config.debug.name}` : undefined })
  if (config.debug) setSignalMeta(stateSignal as Signal<unknown>, config.debug)

  function resolveTransition(snapshot: MachineSnapshot<State, Context>, event: Event) {
    const transitions = config.states[snapshot.state]?.on
    return transitions?.[event.type as Event["type"]] as MachineTransition<State, Event, Context> | undefined
  }

  function applyTransition(snapshot: MachineSnapshot<State, Context>, event: Event) {
    const transition = resolveTransition(snapshot, event)
    if (!transition) return null
    if (transition.guard && !transition.guard(snapshot, event)) return null

    const target = transition.target ?? snapshot.state
    const reduced = transition.reduce?.(snapshot, event)
    const nextContext = reduced ? ({ ...snapshot.context, ...reduced } as Context) : snapshot.context
    const nextSnapshot: MachineSnapshot<State, Context> = {
      state: target,
      context: nextContext,
    }
    return { transition, nextSnapshot }
  }

  return {
    snapshot() {
      return stateSignal.get()
    },
    signal() {
      return stateSignal
    },
    subscribe(listener) {
      const stop = effect(() => {
        listener(stateSignal.get())
      })
      return { unsubscribe: stop }
    },
    send(event) {
      const previous = cloneSnapshot(stateSignal.peek())
      const resolved = applyTransition(stateSignal.peek(), event)
      if (!resolved) {
        return {
          changed: false,
          previous,
          current: previous,
        }
      }

      const nextSnapshot = resolved.nextSnapshot
      const changed = nextSnapshot.state !== previous.state || nextSnapshot.context !== stateSignal.peek().context
      stateSignal.set(nextSnapshot)
      resolved.transition.effect?.(previous, event, nextSnapshot)
      return {
        changed,
        previous,
        current: cloneSnapshot(stateSignal.peek()),
      }
    },
    can(event) {
      return applyTransition(stateSignal.peek(), event) !== null
    },
    matches(state) {
      return stateSignal.peek().state === state
    },
    reset() {
      const previous = cloneSnapshot(stateSignal.peek())
      const next = cloneSnapshot(initialSnapshot)
      stateSignal.set(next)
      return {
        changed: previous.state !== next.state || previous.context !== next.context,
        previous,
        current: cloneSnapshot(stateSignal.peek()),
      }
    },
  }
}

export function createPressMachine() {
  return createMachine<PressState, PressEvent, PressContext>({
    initial: "idle",
    context: {
      originPointer: { x: 0, y: 0 },
      lastPointer: { x: 0, y: 0 },
    },
    debug: {
      name: "press",
      scope: "ui.internal",
      hidden: true,
    },
    states: {
      idle: {
        on: {
          PRESS: {
            target: "pressed",
            reduce: (_snapshot, event) => ({
              originPointer: event.point,
              lastPointer: event.point,
            }),
          },
        },
      },
      pressed: {
        on: {
          RELEASE: {
            target: "idle",
            reduce: (_snapshot, event) => ({
              lastPointer: event.point,
            }),
          },
          CANCEL: {
            target: "idle",
          },
        },
      },
    },
  })
}
