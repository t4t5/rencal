import {
  argValues,
  COMMANDS,
  type CommandDef,
  type CommandGroup,
  type CommandValues,
  describeAction,
} from "@/lib/commands"
import type { Binding } from "@/lib/key-bindings"

export interface ActionRow {
  action: string
  label: string
  group: CommandGroup
}

// Every action a key can run: each command, or each value of a command whose
// values are fixed or listed (views, units), plus whatever keys.toml binds.
export function actionRows(values: CommandValues, bindings: readonly Binding[]): ActionRow[] {
  const actions = COMMANDS.flatMap((command: CommandDef) => {
    if (command.cliOnly) return []
    const arg = command.args?.[0]
    if (arg && (command.palette === "values" || arg.values)) {
      return argValues(command, arg, values).map((choice) => `${command.id}:${choice.value}`)
    }
    return [command.id]
  })
  for (const { action } of bindings) if (!actions.includes(action)) actions.push(action)
  return actions.flatMap((action) => {
    const described = describeAction(action, values)
    return described ? [{ action, ...described }] : []
  })
}
