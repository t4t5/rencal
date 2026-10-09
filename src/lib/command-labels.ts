// What the UI calls each command, in the user's language. The registry in
// `@/lib/commands` keeps English labels because `rencal commands` prints them;
// everything shown in the app goes through here instead.
import { i18n, type MessageDescriptor } from "@lingui/core"
import { msg } from "@lingui/core/macro"

import {
  argValues,
  type CommandDef,
  type CommandGroup,
  type CommandId,
  type CommandValue,
  type CommandValues,
  findCommand,
  parseAction,
} from "@/lib/commands"

const GROUP_LABELS: Record<CommandGroup, MessageDescriptor> = {
  Calendar: msg({ message: "Calendar", context: "command group" }),
  View: msg({ message: "View", context: "command group" }),
  Navigation: msg({ message: "Navigation", context: "command group" }),
  General: msg({ message: "General", context: "command group" }),
}

const COMMAND_LABELS: Record<CommandId, MessageDescriptor> = {
  "event.new-on-day": msg`Add event to selected day`,
  "event.duplicate": msg`Duplicate selected event`,
  "search.open": msg`Search`,
  "event.new": msg`Compose new event`,
  "invites.toggle": msg`Toggle invitations`,
  "view.switch": msg`Switch view`,
  "week-numbers.toggle": msg`Toggle week numbers`,
  "group.switch": msg`Switch calendar group…`,
  "group.next": msg`Next calendar group`,
  "sidebar.toggle": msg`Toggle sidebar`,
  "date.go": msg`Go to date…`,
  "date.today": msg`Go to today`,
  "date.next": msg`Next day, week or month`,
  "date.prev": msg`Previous day, week or month`,
  "event.next": msg`Next event`,
  "event.prev": msg`Previous event`,
  "theme.set": msg`Set theme…`,
  "app.settings": msg`Go to settings`,
  "app.shortcuts": msg`Show keyboard shortcuts`,
  "theme.toggle": msg`Toggle theme`,
  "app.sync": msg`Sync now`,
  "app.palette": msg`Open command palette`,
  "app.commands": msg`List commands, their arguments and keys`,
}

const PALETTE_LABELS: Partial<Record<CommandId, MessageDescriptor>> = {
  "search.open": msg`Search events…`,
}

// Fixed argument values whose label the registry spells in English.
const VALUE_LABELS: Partial<Record<CommandId, Record<string, MessageDescriptor>>> = {
  "date.next": { day: msg`Next day`, week: msg`Next week`, month: msg`Next month` },
  "date.prev": {
    day: msg`Previous day`,
    week: msg`Previous week`,
    month: msg`Previous month`,
  },
}

// Built-in views get their own message; a plugin's view uses its own name in the template.
const BUILTIN_VIEW_SWITCH_LABELS: Record<string, MessageDescriptor> = {
  week: msg`Display week view`,
  month: msg`Display month view`,
  year: msg`Display year view`,
}

interface PromptTexts {
  heading: string
  placeholder: string
  empty: string
}

const PROMPT_TEXTS: Record<string, { heading: MessageDescriptor; placeholder: MessageDescriptor; empty: MessageDescriptor }> = {
  view: {
    heading: msg({ message: "View", context: "command palette submenu" }),
    placeholder: msg`Search views…`,
    empty: msg`No views found.`,
  },
  theme: {
    heading: msg({ message: "Theme", context: "command palette submenu" }),
    placeholder: msg`Search themes…`,
    empty: msg`No themes found.`,
  },
  group: {
    heading: msg({ message: "Group", context: "calendar group, command palette submenu" }),
    placeholder: msg`Search groups…`,
    empty: msg`No groups found.`,
  },
}

export const commandGroupLabel = (group: CommandGroup): string => i18n._(GROUP_LABELS[group])

export function commandLabel(command: CommandDef): string {
  const label = COMMAND_LABELS[command.id as CommandId]
  return label ? i18n._(label) : command.label
}

export function commandPaletteLabel(command: CommandDef): string {
  const label = PALETTE_LABELS[command.id as CommandId]
  return label ? i18n._(label) : commandLabel(command)
}

export function commandValueLabel(command: CommandDef, choice: CommandValue): string {
  const label = VALUE_LABELS[command.id as CommandId]?.[choice.value]
  return label ? i18n._(label) : choice.label
}

export function viewSwitchLabel(target: { id: string; name: string }): string {
  const builtin = BUILTIN_VIEW_SWITCH_LABELS[target.id]
  if (builtin) return i18n._(builtin)
  const view = target.name.toLowerCase()
  return i18n._(msg`Display ${view} view`)
}

export function commandPromptTexts(argName: string): PromptTexts {
  const texts = PROMPT_TEXTS[argName]
  if (texts) {
    return {
      heading: i18n._(texts.heading),
      placeholder: i18n._(texts.placeholder),
      empty: i18n._(texts.empty),
    }
  }
  const heading = argName.charAt(0).toUpperCase() + argName.slice(1)
  return {
    heading,
    placeholder: i18n._(msg`Search ${argName}s…`),
    empty: i18n._(msg`No ${argName}s found.`),
  }
}

// The label and group a bound action shows under, or undefined for an unknown command.
export function describeCommandAction(
  action: string,
  values: CommandValues,
): { label: string; group: CommandGroup } | undefined {
  const { command: id, value } = parseAction(action)
  const command = findCommand(id)
  if (!command) return undefined
  const arg = command.args?.[0]
  if (value === undefined || !arg) return { label: commandLabel(command), group: command.group }
  const match = argValues(command, arg, values).find((choice) => choice.value === value)
  return {
    label: match ? commandValueLabel(command, match) : `${commandLabel(command)}: ${value}`,
    group: command.group,
  }
}
