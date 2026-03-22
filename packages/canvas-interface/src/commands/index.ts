export type CommandId = string

export type CommandMetadata = {
  title?: string
  description?: string
  category?: string
  tags?: readonly string[]
  aliases?: readonly string[]
}

export type CommandSpec<TContext = unknown> = CommandMetadata & {
  id: CommandId
  run(ctx: TContext): void
  enabled?: (ctx: TContext) => boolean
}

export type CommandExecuteResult =
  | { status: "executed"; commandId: CommandId; resolvedId: CommandId }
  | { status: "missing"; commandId: CommandId }
  | { status: "disabled"; commandId: CommandId; resolvedId: CommandId }

export class CommandRegistry<TContext = unknown> {
  private readonly commands = new Map<CommandId, CommandSpec<TContext>>()
  private readonly aliases = new Map<CommandId, CommandId>()

  register(command: CommandSpec<TContext>) {
    this.unregister(command.id)
    this.commands.set(command.id, command)
    for (const alias of command.aliases ?? []) {
      if (!alias || alias === command.id) continue
      this.aliases.set(alias, command.id)
    }
  }

  unregister(commandId: CommandId) {
    this.commands.delete(commandId)
    for (const [alias, target] of this.aliases) {
      if (target === commandId) this.aliases.delete(alias)
    }
  }

  has(commandId: CommandId) {
    const resolved = this.resolveId(commandId)
    return resolved !== null
  }

  get(commandId: CommandId) {
    const resolved = this.resolveId(commandId)
    if (!resolved) return null
    return this.commands.get(resolved) ?? null
  }

  list() {
    return [...this.commands.values()]
  }

  canExecute(commandId: CommandId, ctx: TContext) {
    const command = this.get(commandId)
    if (!command) return false
    if (command.enabled && !command.enabled(ctx)) return false
    return true
  }

  execute(commandId: CommandId, ctx: TContext): CommandExecuteResult {
    const resolvedId = this.resolveId(commandId)
    if (!resolvedId) return { status: "missing", commandId }

    const command = this.commands.get(resolvedId)
    if (!command) return { status: "missing", commandId }
    if (command.enabled && !command.enabled(ctx)) return { status: "disabled", commandId, resolvedId }

    command.run(ctx)
    return { status: "executed", commandId, resolvedId }
  }

  private resolveId(commandId: CommandId) {
    if (this.commands.has(commandId)) return commandId
    const alias = this.aliases.get(commandId)
    if (!alias) return null
    if (!this.commands.has(alias)) {
      this.aliases.delete(commandId)
      return null
    }
    return alias
  }
}
