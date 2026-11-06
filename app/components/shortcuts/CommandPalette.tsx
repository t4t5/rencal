import { cleanup, computed, effect, keymap, signal, Text, untracked, View } from "nsh"
import type { CommandEntry, CommandItem } from "nsh/base"

import { Command } from "@/components/ui/command"
import { Dialog } from "@/components/ui/dialog"
import { Kbd, KbdGroup } from "@/components/ui/kbd"

import {
  argValues,
  COMMAND_GROUPS,
  COMMANDS,
  type CommandDef,
  type CommandGroup,
  type CommandId,
  type CommandValues,
  findCommand,
} from "@/lib/commands"
import { dateInViewerZone, formatLongDate } from "@/lib/event-time"
import type { Binding } from "@/lib/key-bindings"
import { parseEventText } from "@/lib/magic-parser"

import { CheckIcon, ChevronRightIcon } from "@/icons"
import {
  bindings,
  commandValues,
  currentValues,
  paletteOpen,
  palettePage,
  type PalettePage,
  runSafely,
  setPaletteOpen,
  setPalettePage,
} from "@/stores/commands"

import { ArrowKey, ShortcutKeys } from "./ShortcutKeys"

interface PaletteEntry {
  // The action run on select: `date.today`, `view.switch:week`.
  action: string
  label: string
  group: CommandGroup
  // Selecting asks for this command's argument instead of running it.
  prompt?: CommandId
}

const DATE_RESULT = "date-result"

const firstRequiredArg = (command: CommandDef) => command.args?.find((arg) => arg.required)

export function paletteEntries(values: CommandValues): PaletteEntry[] {
  const entries = COMMANDS.flatMap((command: CommandDef): PaletteEntry[] => {
    const arg = command.args?.[0]
    if (command.palette === "values" && arg) {
      return argValues(command, arg, values).map((choice) => ({
        action: `${command.id}:${choice.value}`,
        label: choice.label,
        group: command.group,
      }))
    }
    if (command.palette !== "command") return []
    const prompt = firstRequiredArg(command)
    // Hidden when there's nothing to choose between.
    if (prompt && prompt.kind !== "date" && argValues(command, prompt, values).length < 2) {
      return []
    }
    return [
      {
        action: command.id,
        label: command.paletteLabel ?? command.label,
        group: command.group,
        prompt: prompt ? (command.id as CommandId) : undefined,
      },
    ]
  })
  return COMMAND_GROUPS.flatMap((group) => entries.filter((entry) => entry.group === group))
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

const shortcutOf = (action: string, list: readonly Binding[]) =>
  list.find((binding) => binding.action === action && !binding.hidden)?.keys

function PaletteFooter(props: { escAction: string }) {
  return (
    <View class="flex-row items-center gap-4 border-t border-border px-3 py-2">
      <View class="flex-row items-center gap-1.5">
        <KbdGroup>
          <ArrowKey direction="up" />
          <ArrowKey direction="down" />
        </KbdGroup>
        <Text class="text-xs text-muted-foreground">navigate</Text>
      </View>
      <View class="flex-row items-center gap-1.5">
        <Kbd label="Enter" />
        <Text class="text-xs text-muted-foreground">select</Text>
      </View>
      <View class="flex-row items-center gap-1.5">
        <Kbd label="Esc" />
        <Text class="text-xs text-muted-foreground">{props.escAction}</Text>
      </View>
    </View>
  )
}

function PaletteRow(props: {
  entry: CommandEntry
  keys?: string
  prompt: boolean
  check: boolean
}) {
  return (
    <View class="flex-row items-center gap-2">
      <Text class="flex-1 text-sm text-popover-foreground group-focus:text-accent-foreground line-clamp-1">
        {props.entry.label}
      </Text>
      <If when={props.prompt}>
        <ChevronRightIcon class="size-4 text-muted-foreground opacity-50" />
      </If>
      <If when={props.check}>
        <CheckIcon class="size-4 text-muted-foreground" />
      </If>
      <If when={props.prompt ? undefined : props.keys}>
        {(keys) => <ShortcutKeys keys={keys()} />}
      </If>
    </View>
  )
}

export function CommandPalette() {
  const query = signal("")

  const command = () => {
    const page = palettePage()
    return page === "root" ? undefined : findCommand(page)
  }
  const prompt = () => {
    const current = command()
    return current && firstRequiredArg(current)
  }
  // The date page drives its own dynamic content rather than a list.
  const isDatePage = () => prompt()?.kind === "date"

  const parsedDate = computed(() => {
    if (!isDatePage()) return null
    const start = parseEventText(query()).start
    return start ? dateInViewerZone(start) : null
  })

  const rootEntries = computed(() => paletteEntries(commandValues()))

  const items = computed((): CommandItem[] => {
    const current = command()
    const asked = prompt()
    if (current && asked?.kind === "date") {
      const date = parsedDate()
      if (!date) return []
      const heading = current.label.replace(/…$/, "")
      return [{ id: DATE_RESULT, label: formatLongDate(date), group: heading }]
    }
    if (current && asked) {
      const marked = currentValues()[current.id as CommandId]
      return argValues(current, asked, commandValues()).map((choice) => ({
        id: `${current.id}:${choice.value}`,
        label: choice.label,
        group: capitalize(asked.name),
        checked: choice.value === marked,
      }))
    }
    return rootEntries().map((entry) => ({
      id: entry.action,
      label: entry.label,
      group: entry.group,
      keywords: [entry.group],
    }))
  })

  const close = () => setPaletteOpen(false)

  const goToPage = (next: PalettePage) => {
    query.set("")
    setPalettePage(next)
  }

  const run = (action: string) => {
    close()
    runSafely({ command: action }, "palette")
  }

  const select = (id: string) => {
    const current = command()
    if (id === DATE_RESULT) {
      const date = untracked(parsedDate)
      if (current && date) run(`${current.id}:${date.toString()}`)
      return
    }
    const entry = current ? undefined : untracked(rootEntries).find((e) => e.action === id)
    if (entry?.prompt) goToPage(entry.prompt)
    else run(id)
  }

  // Reopened, it starts over; `palettePage` may already name what to ask.
  effect(() => {
    if (!paletteOpen()) {
      query.set("")
      setPalettePage("root")
    }
  })

  // Backspace on an empty query steps back out of a sub-page.
  effect(() => {
    if (!paletteOpen() || palettePage() === "root" || query() !== "") return
    cleanup(keymap.bind("backspace", () => goToPage("root"), { when: "always" }))
  })

  const placeholder = () => {
    if (isDatePage()) return "Type a date…"
    const asked = prompt()
    return asked ? `Search ${asked.name}s…` : "Type a command…"
  }

  const empty = () => {
    if (isDatePage()) return query() ? "No matching date" : `e.g. "5 Sep", "next sunday"...`
    const asked = prompt()
    return asked ? `No ${asked.name}s found.` : "No commands found."
  }

  return (
    <Dialog
      open={paletteOpen()}
      onOpenChange={setPaletteOpen}
      showCloseButton={false}
      class="w-[576px] gap-0 overflow-hidden p-0"
    >
      <Command
        items={items()}
        query={query()}
        onQueryChange={(event) => query.set(event.query)}
        filterable={!isDatePage()}
        placeholder={placeholder()}
        accessibilityLabel="Commands"
        searchAccessibilityLabel="Search for a command to run"
        // Esc steps back to the root page before it closes the palette.
        onCancel={() => (palettePage() === "root" ? close() : goToPage("root"))}
        onSelect={(event) => select(event.id)}
        renderItem={(entry) => (
          <PaletteRow
            entry={entry}
            keys={shortcutOf(entry.id, bindings())}
            prompt={!!rootEntries().find((e) => e.action === entry.id)?.prompt}
            check={!!entry.checked}
          />
        )}
        empty={<Text class="px-3 py-6 text-center text-sm text-muted-foreground">{empty()}</Text>}
        footer={<PaletteFooter escAction={palettePage() === "root" ? "close" : "back"} />}
      />
    </Dialog>
  )
}
