import { describe, expect, it } from "bun:test"
import { CommandRegistry } from "@tnl/canvas-interface/commands"

type TestContext = {
  log: string[]
  enabled: boolean
}

describe("commands", () => {
  it("registers, resolves aliases, and executes commands", () => {
    const registry = new CommandRegistry<TestContext>()
    const ctx: TestContext = { log: [], enabled: true }

    registry.register({
      id: "edit.copy",
      aliases: ["copy"],
      run(current) {
        current.log.push("copy")
      },
    })

    expect(registry.has("edit.copy")).toBe(true)
    expect(registry.has("copy")).toBe(true)

    const result = registry.execute("copy", ctx)
    expect(result).toEqual({ status: "executed", commandId: "copy", resolvedId: "edit.copy" })
    expect(ctx.log).toEqual(["copy"])
  })

  it("returns disabled when enabled guard blocks execution", () => {
    const registry = new CommandRegistry<TestContext>()
    const ctx: TestContext = { log: [], enabled: false }

    registry.register({
      id: "edit.paste",
      enabled(current) {
        return current.enabled
      },
      run(current) {
        current.log.push("paste")
      },
    })

    expect(registry.canExecute("edit.paste", ctx)).toBe(false)
    expect(registry.execute("edit.paste", ctx)).toEqual({ status: "disabled", commandId: "edit.paste", resolvedId: "edit.paste" })
    expect(ctx.log).toEqual([])
  })

  it("overwrites old aliases when replacing a command id", () => {
    const registry = new CommandRegistry<TestContext>()

    registry.register({ id: "app.toggle", aliases: ["toggle"], run() {} })
    registry.register({ id: "app.toggle", aliases: ["switch"], run() {} })

    expect(registry.has("toggle")).toBe(false)
    expect(registry.has("switch")).toBe(true)
  })

  it("returns missing for unknown commands", () => {
    const registry = new CommandRegistry<TestContext>()
    const ctx: TestContext = { log: [], enabled: true }

    expect(registry.execute("missing", ctx)).toEqual({ status: "missing", commandId: "missing" })
  })
})
