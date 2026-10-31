// Which key runs which command action. Defaults live here (plus each view's
// shortcut, from `@/views/manifest`); `~/.config/rencal/keys.toml` rebinds or
// unbinds keys on top of them.
import type { KeyEdit } from "@/lib/api"
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

// Physical keys by `KeyboardEvent.code`, named as bindings write them.
const CODE_NAMES: Partial<Record<string, string>> = {
  ArrowLeft: "left",
  ArrowRight: "right",
  ArrowUp: "up",
  ArrowDown: "down",
}

const MODIFIER_KEYS = new Set(["Control", "Shift", "Alt", "AltGraph", "Meta", "OS", "CapsLock"])

// The binding a key press makes, or null for a lone modifier. Characters typed
// without ctrl/alt/meta bind by character, like the defaults; anything else by
// physical key, as react-hotkeys-hook matches it.
export function keysFromEvent(event: KeyboardEvent): string | null {
  if (MODIFIER_KEYS.has(event.key)) return null
  const primary = isMacOS ? event.metaKey : event.ctrlKey
  const plain = !event.ctrlKey && !event.altKey && !event.metaKey
  if (plain && event.key.length === 1 && event.key !== " " && event.key !== ",") {
    const char = event.key.toLowerCase()
    return /[a-z]/.test(char) && event.shiftKey ? `shift+${char}` : char
  }
  const key = CODE_NAMES[event.code] ?? event.code.toLowerCase().replace(/^(key|digit|numpad)/, "")
  if (!key) return null
  const modifiers = [
    primary && "mod",
    !isMacOS && event.metaKey && "meta",
    isMacOS && event.ctrlKey && "ctrl",
    event.altKey && "alt",
    event.shiftKey && "shift",
  ].filter((modifier) => modifier !== false)
  return [...modifiers, key].join("+")
}

const sameKeys = (a: string) => (b: { keys: string }) => canonicalKeys(b.keys) === canonicalKeys(a)

// The keys.toml entry for `keys`, spelled as the file has it, so edits replace it.
const fileSpelling = (keys: string, user: readonly UserBinding[]) =>
  user.find(sameKeys(keys))?.keys ?? keys

// Edits that make `keys` run `action`.
export function bindKeyEdits(
  keys: string,
  action: string,
  defaults: readonly Binding[],
  user: readonly UserBinding[],
): KeyEdit[] {
  const spelled = fileSpelling(keys, user)
  if (defaults.find(sameKeys(keys))?.action === action) {
    // Already the default: drop any override instead of repeating it.
    return user.some(sameKeys(keys)) ? [{ kind: "clear", keys: spelled }] : []
  }
  return [{ kind: "bind", keys: spelled, action }]
}

// Edits that make `keys` do nothing.
export function unbindKeyEdits(
  keys: string,
  defaults: readonly Binding[],
  user: readonly UserBinding[],
): KeyEdit[] {
  const spelled = fileSpelling(keys, user)
  // A default key needs `false`; a key only keys.toml binds just goes.
  if (defaults.some(sameKeys(keys))) return [{ kind: "unbind", keys: spelled }]
  return user.some(sameKeys(keys)) ? [{ kind: "clear", keys: spelled }] : []
}

// Edits that give `action` back its default keys, taking them from whatever
// keys.toml moved them to, and drop keys keys.toml added to it.
export function resetActionEdits(
  action: string,
  defaults: readonly Binding[],
  user: readonly UserBinding[],
): KeyEdit[] {
  const defaultKeys = defaults.filter((binding) => binding.action === action)
  return user
    .filter(
      (binding) => binding.action === action || defaultKeys.some((d) => sameKeys(d.keys)(binding)),
    )
    .map((binding) => ({ kind: "clear", keys: binding.keys }))
}

// Whether `action`'s keys differ from its defaults.
export function isCustomized(
  action: string,
  defaults: readonly Binding[],
  bindings: readonly Binding[],
): boolean {
  const keysOf = (list: readonly Binding[]) =>
    list
      .filter((binding) => binding.action === action)
      .map((binding) => canonicalKeys(binding.keys))
      .sort()
      .join(" ")
  return keysOf(defaults) !== keysOf(bindings)
}
