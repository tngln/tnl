import { describe, expect, it } from "bun:test"
import { ShortcutManager, type ShortcutContextResolver, type ShortcutExecutionContext } from "./shortcuts"

type TestContext = ShortcutExecutionContext & {
  log: string[]
  enabled: boolean
  allowGlobal: boolean
}

function createManager(opts: Partial<TestContext> = {}) {
  const ctx: TestContext = {
    log: [],
    enabled: true,
    allowGlobal: true,
    activeWindowId: null,
    activePaneId: null,
    activeContainerId: null,
    ...opts,
  }
  const resolver: ShortcutContextResolver<TestContext> = {
    resolve(current) {
      const contexts: string[] = []
      if (current.captureTopLevelTarget && typeof (current.captureTopLevelTarget as any).id === "string") contexts.push(`capture:${(current.captureTopLevelTarget as any).id}`)
      if (current.focusTopLevelTarget && typeof (current.focusTopLevelTarget as any).id === "string") contexts.push(`focus:${(current.focusTopLevelTarget as any).id}`)
      if (current.hoverTopLevelTarget && typeof (current.hoverTopLevelTarget as any).id === "string") contexts.push(`hover:${(current.hoverTopLevelTarget as any).id}`)
      if (current.activeWindowId) contexts.push(`window:${current.activeWindowId}`)
      if (current.activePaneId) contexts.push(`pane:${current.activePaneId}`)
      contexts.push("global")
      return contexts
    },
  }
  const manager = new ShortcutManager<TestContext>({
    resolver,
    getExecutionContext: () => ctx,
  })
  return { manager, ctx }
}

describe("shortcuts", () => {
  it("tracks key state and clears it on reset", () => {
    const { manager } = createManager()

    manager.handleKeyDown({ code: "ControlLeft", ctrlKey: true })
    manager.handleKeyDown({ code: "KeyS", ctrlKey: true })

    expect(manager.input.snapshot().keys).toEqual(["ControlLeft", "KeyS"])
    expect(manager.input.snapshot().modifiers.ctrl).toBe(true)

    manager.resetInputState()

    expect(manager.input.snapshot().keys).toEqual([])
    expect(manager.input.snapshot().pointerButtons).toEqual([])
    expect(manager.input.snapshot().modifiers).toEqual({ ctrl: false, meta: false, alt: false, shift: false })
  })

  it("matches keyboard shortcuts by code and exact modifiers", () => {
    const { manager, ctx } = createManager()
    manager.registerCommand({ id: "save", run(current) { current.log.push("save") } })
    manager.registerBinding({
      command: "save",
      context: "global",
      trigger: { kind: "key-down", code: "KeyS" },
      modifiers: ["Ctrl"],
    })

    manager.handleKeyDown({ code: "ControlLeft", ctrlKey: true })
    const handled = manager.handleKeyDown({ code: "KeyS", ctrlKey: true })

    expect(handled).toBe(true)
    expect(ctx.log).toEqual(["save"])

    manager.handleKeyUp({ code: "KeyS", ctrlKey: true })
    manager.handleKeyUp({ code: "ControlLeft" })
    manager.handleKeyDown({ code: "ControlLeft", ctrlKey: true, shiftKey: true })
    manager.handleKeyDown({ code: "ShiftLeft", ctrlKey: true, shiftKey: true })
    manager.handleKeyDown({ code: "KeyS", ctrlKey: true, shiftKey: true })

    expect(ctx.log).toEqual(["save"])
  })

  it("matches pointer and wheel shortcuts against current simultaneous input state", () => {
    const { manager, ctx } = createManager()
    manager.registerCommand({ id: "alt-primary", run(current) { current.log.push("alt-primary") } })
    manager.registerCommand({ id: "space-wheel", run(current) { current.log.push("space-wheel") } })
    manager.registerBinding({
      command: "alt-primary",
      context: "global",
      trigger: { kind: "pointer-down", button: "Primary" },
      modifiers: ["Alt"],
      withPointerButtons: ["Primary"],
    })
    manager.registerBinding({
      command: "space-wheel",
      context: "global",
      trigger: { kind: "wheel", axis: "y" },
      withPointerButtons: [],
      when: () => manager.input.isKeyPressed("Space"),
    })

    manager.handlePointerDown({ button: 0, buttons: 1, altKey: true })
    expect(ctx.log).toEqual(["alt-primary"])

    manager.handlePointerUp({ button: 0, buttons: 0, altKey: true })
    manager.handleKeyDown({ code: "Space" })
    manager.handleWheel({ deltaX: 0, deltaY: 12 })

    expect(ctx.log).toEqual(["alt-primary", "space-wheel"])
  })

  it("uses context priority before global fallback", () => {
    const { manager, ctx } = createManager({ activeWindowId: "Main" })
    manager.registerCommand({ id: "global", run(current) { current.log.push("global") } })
    manager.registerCommand({ id: "window", run(current) { current.log.push("window") } })
    manager.registerBinding({ command: "global", context: "global", trigger: { kind: "key-down", code: "F2" } })
    manager.registerBinding({ command: "window", context: "window:Main", trigger: { kind: "key-down", code: "F2" } })

    manager.handleKeyDown({ code: "F2" })
    expect(ctx.log).toEqual(["window"])

    ctx.activeWindowId = "Other"
    manager.handleKeyUp({ code: "F2" })
    manager.handleKeyDown({ code: "F2" })
    expect(ctx.log).toEqual(["window", "global"])
  })

  it("prefers focused top-level context before window and global", () => {
    const focusedWindow = { id: "Focused" }
    const { manager, ctx } = createManager({ activeWindowId: "Main", focusTopLevelTarget: focusedWindow })
    manager.registerCommand({ id: "focus", run(current) { current.log.push("focus") } })
    manager.registerCommand({ id: "window", run(current) { current.log.push("window") } })
    manager.registerCommand({ id: "global", run(current) { current.log.push("global") } })
    manager.registerBinding({ command: "global", context: "global", trigger: { kind: "key-down", code: "F6" } })
    manager.registerBinding({ command: "window", context: "window:Main", trigger: { kind: "key-down", code: "F6" } })
    manager.registerBinding({ command: "focus", context: "focus:Focused", trigger: { kind: "key-down", code: "F6" } })

    manager.handleKeyDown({ code: "F6" })

    expect(ctx.log).toEqual(["focus"])
  })

  it("honors enabled, when, preventDefault and stop", () => {
    const { manager, ctx } = createManager()
    let prevented = 0

    manager.registerCommand({
      id: "first",
      enabled(current) {
        return current.enabled
      },
      run(current) {
        current.log.push("first")
      },
    })
    manager.registerCommand({
      id: "second",
      run(current) {
        current.log.push("second")
      },
    })
    manager.registerBinding({
      command: "first",
      context: "global",
      trigger: { kind: "key-down", code: "F3" },
      when(current) {
        return current.allowGlobal
      },
      preventDefault: true,
      stop: false,
    })
    manager.registerBinding({
      command: "second",
      context: "global",
      trigger: { kind: "key-down", code: "F3" },
    })

    manager.handleKeyDown({
      code: "F3",
      preventDefault() {
        prevented += 1
      },
    })

    expect(ctx.log).toEqual(["first", "second"])
    expect(prevented).toBe(2)

    ctx.enabled = false
    ctx.allowGlobal = false
    manager.handleKeyUp({ code: "F3" })
    manager.handleKeyDown({ code: "F3" })

    expect(ctx.log).toEqual(["first", "second", "second"])
  })

  it("overrides bindings by command or context", () => {
    const { manager, ctx } = createManager()
    manager.registerCommand({ id: "toggle", run(current) { current.log.push("toggle") } })
    manager.registerBinding({ command: "toggle", context: "global", trigger: { kind: "key-down", code: "F1" } })

    manager.overrideBindings({
      command: "toggle",
      bindings: [{ command: "toggle", context: "global", trigger: { kind: "key-down", code: "F5" } }],
    })

    manager.handleKeyDown({ code: "F1" })
    manager.handleKeyUp({ code: "F1" })
    manager.handleKeyDown({ code: "F5" })

    expect(ctx.log).toEqual(["toggle"])
  })
})
