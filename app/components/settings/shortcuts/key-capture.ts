/*
 * NSH reports no key event outside a text field, only the keystrokes it was
 * asked to bind. So capturing the next key press binds every keystroke a key
 * can have for as long as the capture lasts.
 */
import { keymap } from "nsh"

const MODIFIERS = [
  "",
  "shift",
  "alt",
  "mod",
  "alt+shift",
  "mod+shift",
  "mod+alt",
  "mod+alt+shift",
  "meta",
  "meta+shift",
]

const NAMED_KEYS = [
  "space",
  "enter",
  "tab",
  "backspace",
  "delete",
  "insert",
  "up",
  "down",
  "left",
  "right",
  "home",
  "end",
  "pageup",
  "pagedown",
  ...Array.from({ length: 12 }, (_, i) => `f${i + 1}`),
]

const LETTERS = "abcdefghijklmnopqrstuvwxyz"
const SYMBOLS = "0123456789`[]\;',./"
const KEYS = [...LETTERS, ...SYMBOLS, "minus", "plus", ...NAMED_KEYS]

// What each unshifted key types with Shift, and how keys.toml names the rest.
const SHIFTED: Partial<Record<string, string>> = {
  "1": "!",
  "2": "@",
  "3": "#",
  "4": "$",
  "5": "%",
  "6": "^",
  "7": "&",
  "8": "*",
  "9": "(",
  "0": ")",
  minus: "_",
  "[": "{",
  "]": "}",
  "\\": "|",
  ";": ":",
  "'": '"',
  ",": "<",
  ".": ">",
  "/": "?",
  "`": "~",
}

const FILE_NAMES: Partial<Record<string, string>> = { ",": "comma", minus: "-", plus: "=" }

export const allKeystrokes = () =>
  MODIFIERS.flatMap((modifiers) => KEYS.map((key) => (modifiers ? `${modifiers}+${key}` : key)))

/** The spelling keys.toml uses for a keystroke, as `keysFromEvent` wrote it for a key press. */
export function keysFromKeystroke(keystroke: string): string {
  const parts = keystroke.split(/\+(?=.)/)
  const key = parts.pop() ?? ""
  if (parts.length === 1 && parts[0] === "shift") {
    const shifted = SHIFTED[key]
    if (shifted) return shifted
  }
  return [...parts, FILE_NAMES[key] ?? key].join("+")
}

/**
 * Calls `onKeys` with the next key press, or `onCancel` on Escape; returns how
 * to stop. A keystroke the platform keeps (Alt+F4, F11) can't be bound, so isn't offered.
 */
export function captureKeys(onKeys: (keys: string) => void, onCancel: () => void) {
  const unbinds = allKeystrokes().flatMap((keystroke) => {
    try {
      return [
        keymap.bind(keystroke, () => onKeys(keysFromKeystroke(keystroke)), { when: "always" }),
      ]
    } catch {
      return []
    }
  })
  unbinds.push(keymap.bind("escape", onCancel, { when: "always" }))
  return () => unbinds.forEach((unbind) => unbind())
}
