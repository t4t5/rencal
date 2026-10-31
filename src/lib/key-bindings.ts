// Which key runs which command action. Defaults live here (plus each view's
// shortcut, from `@/views/manifest`); `~/.config/rencal/keys.toml` rebinds or
// unbinds keys on top of them.
import { findCommand, parseAction } from "@/lib/commands"
import { isMacOS } from "@/lib/utils"

export interface Binding {
  // react-hotkeys-hook syntax: "l", "mod+shift+t", "shift+tab".
  keys: string
  // A command action: "date.next:day".
  action: string
  // Works, but isn't listed where keys are shown.
  hidden?: boolean
}

// From keys.toml; a null action unbinds the key.
export interface UserBinding {
  keys: string
  action: string | null
}

// Array order is the order the shortcuts overlay lists actions in.
export const DEFAULT_BINDINGS: readonly Binding[] = [
  { keys: "right", action: "date.next:day" },
  { keys: "l", action: "date.next:day" },
  { keys: "left", action: "date.prev:day" },
  { keys: "h", action: "date.prev:day" },
  { keys: "down", action: "date.next:week" },
  { keys: "j", action: "date.next:week" },
  { keys: "up", action: "date.prev:week" },
  { keys: "k", action: "date.prev:week" },
  { keys: "ctrl+d", action: "date.next:month" },
  { keys: "ctrl+u", action: "date.prev:month" },
  { keys: "tab", action: "event.next" },
  { keys: "shift+tab", action: "event.prev" },
  { keys: "t", action: "date.today" },
  { keys: ".", action: "date.go" },
  { keys: "g", action: "group.next" },
  { keys: "ctrl+b", action: "sidebar.toggle" },
  { keys: "mod+f", action: "search.open", hidden: true },
  { keys: "mod+p", action: "search.open", hidden: true },
  { keys: "/", action: "search.open" },
  { keys: "c", action: "event.new" },
  { keys: "a", action: "event.new-on-day" },
  { keys: "d", action: "event.duplicate" },
  { keys: "i", action: "invites.toggle" },
  { keys: "s", action: "app.sync" },
  { keys: "mod+comma", action: "app.settings" },
  { keys: "mod+shift+t", action: "theme.toggle" },
  { keys: "?", action: "app.shortcuts" },
  { keys: "mod+k", action: "app.palette" },
]

const MODIFIERS = ["mod", "ctrl", "alt", "shift", "meta"] as const
type Modifier = (typeof MODIFIERS)[number]

function splitKeys(keys: string): { modifiers: Modifier[]; key: string } {
  const parts = keys.trim().toLowerCase().split("+")
  const key = parts.pop() ?? ""
  return { modifiers: parts as Modifier[], key }
}

// Why `keys` can't be bound, or null when it can.
export function keysError(keys: string): string | null {
  if (keys.includes(",")) return `"${keys}": write "comma" for the comma key`
  const { modifiers, key } = splitKeys(keys)
  if (!key) return `"${keys}" has no key`
  const unknown = modifiers.find((modifier) => !MODIFIERS.includes(modifier))
  if (unknown !== undefined) {
    return `"${keys}": unknown modifier "${unknown}" (use ${MODIFIERS.join(", ")})`
  }
  return null
}

// Single characters without modifiers match the character typed, whatever the
// keyboard layout (QWERTY, AZERTY, ...).
export function isCharKey(keys: string): boolean {
  const { modifiers, key } = splitKeys(keys)
  return modifiers.length === 0 && key.length === 1
}

// One spelling per physical key, so "shift+ctrl+d" overrides "ctrl+d" style
// differences and "mod+d" meets "ctrl+d" on Linux.
export function canonicalKeys(keys: string): string {
  const { modifiers, key } = splitKeys(keys)
  const physical = new Set<string>(
    modifiers.map((modifier) => (modifier === "mod" ? (isMacOS ? "meta" : "ctrl") : modifier)),
  )
  return [...MODIFIERS.filter((modifier) => physical.has(modifier)), key].join("+")
}

// Why `action` can't be bound, or null when it can. Values that come from app
// state (views, groups, themes) are checked when the key is pressed.
export function actionError(action: string): string | null {
  const { command: id, value } = parseAction(action)
  const command = findCommand(id)
  if (!command) return `unknown command "${id}"`
  if (value === undefined) return null
  const arg = command.args?.[0]
  if (!arg) return `${id} takes no value, so "${action}" can't be bound`
  if (arg.values && !arg.values.some((choice) => choice.value === value)) {
    return `"${action}": ${arg.name} is one of ${arg.values.map((choice) => choice.value).join(", ")}`
  }
  return null
}

// The defaults with `user` applied: a user binding replaces the default on the
// same key in place, or is added at the end; a null action removes it.
export function resolveBindings(
  defaults: readonly Binding[],
  user: readonly UserBinding[],
): { bindings: Binding[]; errors: string[] } {
  const byKey = new Map<string, Binding | null>(
    defaults.map((binding) => [canonicalKeys(binding.keys), binding]),
  )
  const errors: string[] = []
  for (const { keys, action } of user) {
    const error = keysError(keys) ?? (action === null ? null : actionError(action.trim()))
    if (error) {
      errors.push(error)
      continue
    }
    // A Map keeps a replaced key's position and appends a new one.
    byKey.set(
      canonicalKeys(keys),
      action === null ? null : { keys: keys.trim().toLowerCase(), action: action.trim() },
    )
  }
  return {
    bindings: [...byKey.values()].filter((binding) => binding !== null),
    errors,
  }
}
