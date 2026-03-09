export type ShortcutModifier = "Ctrl" | "Meta" | "Alt" | "Shift"
export type PointerButtonName = "Primary" | "Middle" | "Secondary"
export type ShortcutContextKey = string
export type CommandId = string

export type ShortcutTrigger =
  | { kind: "key-down"; code: string }
  | { kind: "pointer-down"; button: PointerButtonName }
  | { kind: "pointer-up"; button: PointerButtonName }
  | { kind: "wheel"; axis?: "x" | "y" | "any"; direction?: "positive" | "negative" | "any" }

export type ShortcutExecutionContext = {
  wm?: unknown
  docking?: unknown
  codecs?: unknown
  inspector?: unknown
  activeWindowId?: string | null
  activePaneId?: string | null
  activeContainerId?: string | null
  focusTarget?: unknown
  focusTopLevelTarget?: unknown
  hoverTarget?: unknown
  captureTarget?: unknown
  hoverTopLevelTarget?: unknown
  captureTopLevelTarget?: unknown
}

export type ShortcutCommand<TContext extends ShortcutExecutionContext = ShortcutExecutionContext> = {
  id: CommandId
  run(ctx: TContext): void
  enabled?: (ctx: TContext) => boolean
}

export type ShortcutBinding<TContext extends ShortcutExecutionContext = ShortcutExecutionContext> = {
  command: CommandId
  context: ShortcutContextKey
  trigger: ShortcutTrigger
  modifiers?: readonly ShortcutModifier[]
  withPointerButtons?: readonly PointerButtonName[]
  when?: (ctx: TContext) => boolean
  preventDefault?: boolean
  stop?: boolean
  priority?: number
}

export type ShortcutOverride<TContext extends ShortcutExecutionContext = ShortcutExecutionContext> = {
  command?: CommandId
  context?: ShortcutContextKey
  bindings: readonly ShortcutBinding<TContext>[]
}

export type ShortcutContextResolver<TContext extends ShortcutExecutionContext = ShortcutExecutionContext> = {
  resolve(ctx: TContext): readonly ShortcutContextKey[]
}

export type ModifierSnapshot = {
  ctrl: boolean
  meta: boolean
  alt: boolean
  shift: boolean
}

export type InputStateSnapshot = {
  keys: readonly string[]
  pointerButtons: readonly PointerButtonName[]
  modifiers: ModifierSnapshot
  pointerPosition: { x: number; y: number } | null
}

type KeyboardLike = {
  code: string
  ctrlKey?: boolean
  metaKey?: boolean
  altKey?: boolean
  shiftKey?: boolean
  repeat?: boolean
  preventDefault?: () => void
}

type PointerLike = {
  button: number
  buttons?: number
  x?: number
  y?: number
  ctrlKey?: boolean
  metaKey?: boolean
  altKey?: boolean
  shiftKey?: boolean
  preventDefault?: () => void
}

type WheelLike = {
  deltaX: number
  deltaY: number
  x?: number
  y?: number
  ctrlKey?: boolean
  metaKey?: boolean
  altKey?: boolean
  shiftKey?: boolean
  preventDefault?: () => void
}

type InternalBinding<TContext extends ShortcutExecutionContext> = ShortcutBinding<TContext> & {
  order: number
}

function normalizeModifiers(modifiers?: readonly ShortcutModifier[]): ModifierSnapshot {
  const set = new Set(modifiers ?? [])
  return {
    ctrl: set.has("Ctrl"),
    meta: set.has("Meta"),
    alt: set.has("Alt"),
    shift: set.has("Shift"),
  }
}

function exactModifiersMatch(actual: ModifierSnapshot, expected?: readonly ShortcutModifier[]) {
  const normalized = normalizeModifiers(expected)
  return actual.ctrl === normalized.ctrl && actual.meta === normalized.meta && actual.alt === normalized.alt && actual.shift === normalized.shift
}

export function pointerButtonFromNumber(button: number): PointerButtonName | null {
  if (button === 0) return "Primary"
  if (button === 1) return "Middle"
  if (button === 2) return "Secondary"
  return null
}

function pointerButtonsFromMask(buttons: number): PointerButtonName[] {
  const result: PointerButtonName[] = []
  if ((buttons & 1) !== 0) result.push("Primary")
  if ((buttons & 4) !== 0) result.push("Middle")
  if ((buttons & 2) !== 0) result.push("Secondary")
  return result
}

export class InputState {
  private readonly keys = new Set<string>()
  private readonly pointerButtons = new Set<PointerButtonName>()
  private modifiers: ModifierSnapshot = { ctrl: false, meta: false, alt: false, shift: false }
  private pointerPosition: { x: number; y: number } | null = null

  snapshot(): InputStateSnapshot {
    return {
      keys: [...this.keys],
      pointerButtons: [...this.pointerButtons],
      modifiers: { ...this.modifiers },
      pointerPosition: this.pointerPosition ? { ...this.pointerPosition } : null,
    }
  }

  isKeyPressed(code: string) {
    return this.keys.has(code)
  }

  syncKeyDown(event: KeyboardLike) {
    this.modifiers = {
      ctrl: !!event.ctrlKey,
      meta: !!event.metaKey,
      alt: !!event.altKey,
      shift: !!event.shiftKey,
    }
    const wasPressed = this.keys.has(event.code)
    this.keys.add(event.code)
    return { wasPressed }
  }

  syncKeyUp(event: KeyboardLike) {
    this.modifiers = {
      ctrl: !!event.ctrlKey,
      meta: !!event.metaKey,
      alt: !!event.altKey,
      shift: !!event.shiftKey,
    }
    this.keys.delete(event.code)
  }

  syncPointerDown(event: PointerLike) {
    this.syncPointerCommon(event)
    const button = pointerButtonFromNumber(event.button)
    if (button) this.pointerButtons.add(button)
    if (typeof event.buttons === "number") this.replacePointerButtonsFromMask(event.buttons)
  }

  syncPointerUp(event: PointerLike) {
    this.syncPointerCommon(event)
    if (typeof event.buttons === "number") {
      this.replacePointerButtonsFromMask(event.buttons)
      return
    }
    const button = pointerButtonFromNumber(event.button)
    if (button) this.pointerButtons.delete(button)
  }

  syncWheel(event: WheelLike) {
    this.syncPointerCommon(event)
  }

  reset() {
    this.keys.clear()
    this.pointerButtons.clear()
    this.modifiers = { ctrl: false, meta: false, alt: false, shift: false }
    this.pointerPosition = null
  }

  private syncPointerCommon(event: { x?: number; y?: number; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean; shiftKey?: boolean }) {
    this.modifiers = {
      ctrl: !!event.ctrlKey,
      meta: !!event.metaKey,
      alt: !!event.altKey,
      shift: !!event.shiftKey,
    }
    if (typeof event.x === "number" && typeof event.y === "number") this.pointerPosition = { x: event.x, y: event.y }
  }

  private replacePointerButtonsFromMask(buttons: number) {
    this.pointerButtons.clear()
    for (const button of pointerButtonsFromMask(buttons)) this.pointerButtons.add(button)
  }
}

export class ShortcutManager<TContext extends ShortcutExecutionContext = ShortcutExecutionContext> {
  readonly input = new InputState()
  private readonly commands = new Map<CommandId, ShortcutCommand<TContext>>()
  private bindings: InternalBinding<TContext>[] = []
  private readonly resolver: ShortcutContextResolver<TContext>
  private readonly getExecutionContext: () => TContext
  private nextOrder = 0

  constructor(opts: { resolver: ShortcutContextResolver<TContext>; getExecutionContext: () => TContext }) {
    this.resolver = opts.resolver
    this.getExecutionContext = opts.getExecutionContext
  }

  registerCommand(command: ShortcutCommand<TContext>) {
    this.commands.set(command.id, command)
  }

  registerBinding(binding: ShortcutBinding<TContext>) {
    this.bindings.push({ ...binding, order: this.nextOrder++ })
  }

  overrideBindings(override: ShortcutOverride<TContext>) {
    this.bindings = this.bindings.filter((binding) => {
      if (override.command && binding.command !== override.command) return true
      if (override.context && binding.context !== override.context) return true
      if (!override.command && !override.context) return false
      return false
    })
    for (const binding of override.bindings) this.registerBinding(binding)
  }

  handleKeyDown(event: KeyboardLike) {
    const { wasPressed } = this.input.syncKeyDown(event)
    if (event.repeat || wasPressed) return false
    return this.dispatch({ kind: "key-down", code: event.code }, event)
  }

  handleKeyUp(event: KeyboardLike) {
    this.input.syncKeyUp(event)
    return false
  }

  syncKeyDown(event: KeyboardLike) {
    return this.input.syncKeyDown(event)
  }

  syncKeyUp(event: KeyboardLike) {
    this.input.syncKeyUp(event)
  }

  handlePointerDown(event: PointerLike) {
    this.input.syncPointerDown(event)
    const button = pointerButtonFromNumber(event.button)
    if (!button) return false
    return this.dispatch({ kind: "pointer-down", button }, event)
  }

  handlePointerUp(event: PointerLike) {
    const button = pointerButtonFromNumber(event.button)
    const handled = button ? this.dispatch({ kind: "pointer-up", button }, event) : false
    this.input.syncPointerUp(event)
    return handled
  }

  handleWheel(event: WheelLike) {
    this.input.syncWheel(event)
    return this.dispatch(
      {
        kind: "wheel",
        axis: Math.abs(event.deltaX) > Math.abs(event.deltaY) ? "x" : "y",
        direction: Math.abs(event.deltaX) > Math.abs(event.deltaY) ? (event.deltaX >= 0 ? "positive" : "negative") : event.deltaY >= 0 ? "positive" : "negative",
      },
      event,
    )
  }

  resetInputState() {
    this.input.reset()
  }

  private dispatch(trigger: ShortcutTrigger, nativeEvent?: { preventDefault?: () => void }) {
    const ctx = this.getExecutionContext()
    const contexts = this.resolver.resolve(ctx)
    const state = this.input.snapshot()

    for (const contextKey of contexts) {
      const candidates = this.bindings
        .filter((binding) => binding.context === contextKey && this.triggerMatches(binding.trigger, trigger))
        .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0) || a.order - b.order)

      for (const binding of candidates) {
        if (!exactModifiersMatch(state.modifiers, binding.modifiers)) continue
        if (!this.pointerButtonsMatch(state.pointerButtons, binding.withPointerButtons)) continue
        if (binding.when && !binding.when(ctx)) continue

        const command = this.commands.get(binding.command)
        if (!command) continue
        if (command.enabled && !command.enabled(ctx)) continue

        command.run(ctx)
        if (binding.preventDefault !== false) nativeEvent?.preventDefault?.()
        if (binding.stop !== false) return true
      }
    }
    return false
  }

  private pointerButtonsMatch(actual: readonly PointerButtonName[], expected?: readonly PointerButtonName[]) {
    const actualSet = new Set(actual)
    const expectedSet = new Set(expected ?? [])
    if (actualSet.size !== expectedSet.size) return false
    for (const button of expectedSet) {
      if (!actualSet.has(button)) return false
    }
    return true
  }

  private triggerMatches(binding: ShortcutTrigger, actual: ShortcutTrigger) {
    if (binding.kind !== actual.kind) return false
    if (binding.kind === "key-down" && actual.kind === "key-down") return binding.code === actual.code
    if (binding.kind === "pointer-down" && actual.kind === "pointer-down") return binding.button === actual.button
    if (binding.kind === "pointer-up" && actual.kind === "pointer-up") return binding.button === actual.button
    if (binding.kind === "wheel" && actual.kind === "wheel") {
      const axis = binding.axis ?? "any"
      const direction = binding.direction ?? "any"
      return (axis === "any" || axis === actual.axis) && (direction === "any" || direction === actual.direction)
    }
    return false
  }
}
