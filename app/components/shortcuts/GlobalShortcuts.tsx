import { cleanup, computed, effect, keymap, untracked } from "nsh"

import { findCommand, parseAction } from "@/lib/commands"
import { type Binding, toKeystroke } from "@/lib/key-bindings"

import {
  bindings,
  calendarCovered,
  eventOpen,
  listenForCommands,
  loadKeyBindings,
  runSafely,
  setKeystrokeErrors,
} from "@/stores/commands"

import { CommandPalette } from "./CommandPalette"
import { ShortcutsOverlay } from "./ShortcutsOverlay"
import { setAppMenu } from "./app-menu"

// Held keys step through dates and events; everything else fires once a press.
const REPEATS = new Set(["date.next", "date.prev", "event.next", "event.prev"])

/**
 * NSH consumes every key it fires for, so a key whose command wouldn't run isn't
 * bound at all: Tab keeps moving through an open event, and typing reaches what
 * covers the calendar.
 */
function isLive(binding: Binding, open: boolean, covered: boolean) {
  const command = findCommand(parseAction(binding.action).command)
  if (!command) return false
  if (covered) return !!command.enableOnFormTags
  return !open || !!command.allowWhileEventOpen
}

// Rebinding drops a press on its way to its handler: only do it for a real change.
const sameBindings = (a: readonly Binding[] | undefined, b: readonly Binding[] | undefined) =>
  a?.length === b?.length &&
  !!a?.every((binding, i) => binding.keys === b?.[i]?.keys && binding.action === b?.[i]?.action)

function bindAll(list: readonly Binding[]) {
  const errors: string[] = []
  const unbinds = list.flatMap((binding) => {
    const command = findCommand(parseAction(binding.action).command)
    try {
      return [
        keymap.bind(
          toKeystroke(binding.keys),
          () => runSafely({ command: binding.action }, "key"),
          {
            when: command?.enableOnFormTags ? "always" : "notEditing",
            repeat: REPEATS.has(command?.id ?? ""),
          },
        ),
      ]
    } catch (error) {
      errors.push(`keys.toml: "${binding.keys}": ${String(error)}`)
      return []
    }
  })
  setKeystrokeErrors(errors)
  return () => unbinds.forEach((unbind) => unbind())
}

/** Runs the app's commands: its keys, `rencal do` and the menu, and the overlays they open. */
export function GlobalShortcuts() {
  const live = computed(
    () => {
      const open = eventOpen()
      const covered = calendarCovered()
      return bindings().filter((binding) => isLive(binding, open, covered))
    },
    { equals: sameBindings },
  )

  effect(() => {
    const list = live()
    cleanup(untracked(() => bindAll(list)))
  })

  setAppMenu()
  cleanup(loadKeyBindings())
  cleanup(listenForCommands())

  return (
    <>
      <ShortcutsOverlay />
      <CommandPalette />
    </>
  )
}
