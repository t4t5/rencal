// The command registry: everything renCal can be told to do, by id. Keys
// (`@/lib/key-bindings`), the command palette, the native menu and
// `rencal do` all run these; `GlobalShortcuts` implements them.

export const COMMAND_GROUPS = ["Calendar", "View", "Navigation", "General"] as const
export type CommandGroup = (typeof COMMAND_GROUPS)[number]

export interface CommandValue {
  value: string
  // What a binding to this value is called: "Next day" for `date.next:day`.
  label: string
}

export interface CommandArg {
  name: string
  description: string
  required?: boolean
  // Prompted for with the palette's date page instead of a list.
  kind?: "date"
  // Fixed choices. Choices that come from app state are given at run time.
  values?: readonly CommandValue[]
}

export interface CommandDef {
  id: string
  label: string
  group: CommandGroup
  // A bound value (`date.next:day`, `rencal do date.next day`) fills the first.
  args?: readonly CommandArg[]
  // One palette entry, or one for each value of the first argument.
  palette?: "command" | "values"
  paletteLabel?: string
  // An open event locks the view behind it; only commands that leave it alone opt out.
  allowWhileEventOpen?: boolean
  // react-hotkeys-hook ignores keys inside inputs by default; opt in per command.
  enableOnFormTags?: boolean
  // For `rencal do` only; Settings offers no keys for it.
  cliOnly?: boolean
}

const unitValues = (verb: string): readonly CommandValue[] =>
  ["day", "week", "month"].map((unit) => ({ value: unit, label: `${verb} ${unit}` }))

// Array order is palette order within each group.
export const COMMANDS = [
  {
    id: "event.new-on-day",
    label: "Add event to selected day",
    group: "Calendar",
    palette: "command",
  },
  {
    id: "event.duplicate",
    label: "Duplicate selected event",
    group: "Calendar",
    palette: "command",
    allowWhileEventOpen: true,
  },
  {
    id: "search.open",
    label: "Search",
    paletteLabel: "Search events…",
    group: "Calendar",
    palette: "command",
  },
  { id: "event.new", label: "Compose new event", group: "Calendar" },
  { id: "invites.toggle", label: "Toggle invitations", group: "Calendar" },
  {
    id: "view.switch",
    label: "Switch view",
    group: "View",
    args: [{ name: "view", description: "A view id", required: true }],
    palette: "values",
  },
  {
    id: "week-numbers.toggle",
    label: "Toggle week numbers",
    group: "View",
    palette: "command",
  },
  {
    id: "group.switch",
    label: "Switch calendar group…",
    group: "View",
    args: [{ name: "group", description: "A calendar group name", required: true }],
    palette: "command",
  },
  { id: "group.next", label: "Next calendar group", group: "View" },
  { id: "sidebar.toggle", label: "Toggle sidebar", group: "View" },
  {
    id: "date.go",
    label: "Go to date…",
    group: "Navigation",
    args: [
      {
        name: "date",
        description: 'A date, like "2026-11-02" or "next friday"',
        required: true,
        kind: "date",
      },
    ],
    palette: "command",
  },
  { id: "date.today", label: "Go to today", group: "Navigation", palette: "command" },
  {
    id: "date.next",
    label: "Next day, week or month",
    group: "Navigation",
    args: [
      { name: "unit", description: "How far to move", required: true, values: unitValues("Next") },
    ],
  },
  {
    id: "date.prev",
    label: "Previous day, week or month",
    group: "Navigation",
    args: [
      {
        name: "unit",
        description: "How far to move",
        required: true,
        values: unitValues("Previous"),
      },
    ],
  },
  { id: "event.next", label: "Next event", group: "Navigation" },
  { id: "event.prev", label: "Previous event", group: "Navigation" },
  {
    id: "theme.set",
    label: "Set theme…",
    group: "General",
    args: [{ name: "theme", description: "A theme id", required: true }],
    palette: "command",
    allowWhileEventOpen: true,
  },
  {
    id: "app.settings",
    label: "Go to settings",
    group: "General",
    palette: "command",
    allowWhileEventOpen: true,
  },
  {
    id: "app.shortcuts",
    label: "Show keyboard shortcuts",
    group: "General",
    palette: "command",
    allowWhileEventOpen: true,
  },
  { id: "theme.toggle", label: "Toggle theme", group: "General", allowWhileEventOpen: true },
  { id: "app.sync", label: "Sync now", group: "General", allowWhileEventOpen: true },
  {
    id: "app.palette",
    label: "Open command palette",
    group: "General",
    // So the palette's own key closes it while its input has focus.
    enableOnFormTags: true,
  },
  {
    id: "app.commands",
    label: "List commands, their arguments and keys",
    group: "General",
    allowWhileEventOpen: true,
    cliOnly: true,
  },
] as const satisfies readonly CommandDef[]

export type CommandId = (typeof COMMANDS)[number]["id"]

const COMMAND_BY_ID: ReadonlyMap<string, CommandDef> = new Map(
  COMMANDS.map((command) => [command.id, command]),
)

export function findCommand(id: string): CommandDef | undefined {
  return COMMAND_BY_ID.get(id)
}

// Choices that come from app state (views, groups, themes), by command.
export type CommandValues = Partial<Record<CommandId, readonly CommandValue[]>>

export function argValues(
  command: CommandDef,
  arg: CommandArg,
  values: CommandValues,
): readonly CommandValue[] {
  return arg.values ?? values[command.id as CommandId] ?? []
}

export class CommandError extends Error {
  name = "CommandError"
}

// "date.next:day": a command id and, optionally, a value for its first argument.
export function parseAction(action: string): { command: string; value?: string } {
  const split = action.indexOf(":")
  return split === -1
    ? { command: action }
    : { command: action.slice(0, split), value: action.slice(split + 1) }
}

export interface Invocation {
  // An action: `date.next` or `date.next:day`.
  command: string
  value?: string | null
  args?: Partial<Record<string, string>>
}

export interface ResolvedInvocation {
  command: CommandDef & { id: CommandId }
  args: Partial<Record<string, string>>
  // The first required argument that wasn't given.
  missing?: CommandArg
}

const list = (items: readonly string[]) => items.map((item) => `"${item}"`).join(", ")

// Checks an invocation against its command; throws a `CommandError` that says
// what to change. `values` are the run-time choices for arguments that have them.
export function resolveInvocation(
  invocation: Invocation,
  values: CommandValues,
): ResolvedInvocation {
  const action = parseAction(invocation.command)
  const command = findCommand(action.command) as ResolvedInvocation["command"] | undefined
  if (!command) {
    throw new CommandError(`Unknown command "${action.command}". \`rencal commands\` lists them.`)
  }
  if (action.value !== undefined && invocation.value != null) {
    throw new CommandError(`Give ${command.id} one value, not "${action.value}" and a value`)
  }

  const params = command.args ?? []
  const args: Partial<Record<string, string>> = {}
  for (const [name, value] of Object.entries(invocation.args ?? {})) {
    if (value === undefined) continue
    if (!params.some((param) => param.name === name)) {
      throw new CommandError(
        params.length
          ? `${command.id} has no argument "${name}"; it takes ${list(params.map((param) => param.name))}`
          : `${command.id} takes no arguments`,
      )
    }
    args[name] = value
  }

  const value = action.value ?? invocation.value ?? undefined
  if (value !== undefined) {
    const [first] = params
    if (!first) throw new CommandError(`${command.id} takes no arguments`)
    if (args[first.name] !== undefined) {
      throw new CommandError(`Give ${command.id}'s ${first.name} once`)
    }
    args[first.name] = value
  }

  for (const param of params) {
    const given = args[param.name]
    const choices = argValues(command, param, values)
    if (given !== undefined && choices.length > 0 && !choices.some((c) => c.value === given)) {
      throw new CommandError(
        `Unknown ${param.name} "${given}" for ${command.id}; use one of ${list(choices.map((c) => c.value))}`,
      )
    }
  }

  const missing = params.find((param) => param.required && args[param.name] === undefined)
  return { command, args, missing }
}

// The label and group a bound action shows under, or undefined for an unknown command.
export function describeAction(
  action: string,
  values: CommandValues,
): { label: string; group: CommandGroup } | undefined {
  const { command: id, value } = parseAction(action)
  const command = findCommand(id)
  if (!command) return undefined
  const arg = command.args?.[0]
  if (value === undefined || !arg) return { label: command.label, group: command.group }
  const match = argValues(command, arg, values).find((choice) => choice.value === value)
  return { label: match?.label ?? `${command.label}: ${value}`, group: command.group }
}
