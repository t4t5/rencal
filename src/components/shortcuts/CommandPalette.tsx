import { Temporal } from "@js-temporal/polyfill"
import { useEffect, useMemo, useRef, useState } from "react"

import { ShortcutKeys } from "@/components/shortcuts/ShortcutKeys"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Kbd, KbdGroup } from "@/components/ui/kbd"

import { useKeyBindings } from "@/contexts/KeyBindingsContext"

import {
  argValues,
  COMMAND_GROUPS,
  COMMANDS,
  type CommandDef,
  type CommandGroup as CommandGroupName,
  type CommandId,
  type CommandValues,
  findCommand,
} from "@/lib/commands"
import { formatLongDate, dateInViewerZone } from "@/lib/event-time"
import { parseEventText } from "@/lib/magic-parser"

import { ArrowRightIcon } from "@/icons/arrow-right"
import { CheckIcon } from "@/icons/check"
import { ChevronRightIcon } from "@/icons/chevron-right"

// "root", or the command whose missing argument is being asked for.
export type PalettePage = "root" | CommandId

interface PaletteEntry {
  // The action run on select: `date.today`, `view.switch:week`.
  action: string
  label: string
  group: CommandGroupName
  // Selecting asks for this command's argument instead of running it.
  prompt?: CommandId
}

const firstRequiredArg = (command: CommandDef) => command.args?.find((arg) => arg.required)

function paletteEntries(values: CommandValues): PaletteEntry[] {
  return COMMANDS.flatMap((command: CommandDef): PaletteEntry[] => {
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
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

export function CommandPalette({
  open,
  onOpenChange,
  requestedPage = "root",
  values,
  current,
  onRun,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  requestedPage?: PalettePage
  values: CommandValues
  // The value a prompt's list marks as current, by command.
  current: Partial<Record<CommandId, string>>
  onRun: (action: string) => void
}) {
  const [page, setPage] = useState<PalettePage>("root")
  const [search, setSearch] = useState("")

  // Defer the action until the dialog has fully closed
  // (so Radix's focus restore doesn't fight focus that actions like search/compose set themselves)
  const pendingRef = useRef<(() => void) | null>(null)

  // Land on the requested page when opening:
  useEffect(() => {
    if (open) {
      setPage(requestedPage)
    } else {
      setPage("root")
      setSearch("")
    }
  }, [open, requestedPage])

  const goToPage = (next: PalettePage) => {
    setSearch("")
    setPage(next)
  }

  const run = (action: string) => {
    pendingRef.current = () => onRun(action)
    onOpenChange(false)
  }

  // Backspace on an empty query steps back out of a sub-page.
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (page !== "root" && e.key === "Backspace" && search === "") {
      e.preventDefault()
      goToPage("root")
    }
  }

  const command = page === "root" ? undefined : findCommand(page)
  const prompt = command && firstRequiredArg(command)
  // The date page drives its own dynamic content rather than a list.
  const isDatePage = prompt?.kind === "date"
  const choices = command && prompt && !isDatePage ? argValues(command, prompt, values) : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="gap-0 overflow-hidden p-0 sm:max-w-xl"
        onEscapeKeyDown={(e) => {
          // Esc steps back to the root page before it closes the palette.
          if (page !== "root") {
            e.preventDefault()
            goToPage("root")
          }
        }}
        onCloseAutoFocus={(e) => {
          if (!pendingRef.current) return // Esc/backdrop: let Radix restore focus
          e.preventDefault()
          const action = pendingRef.current
          pendingRef.current = null
          action()
        }}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Command palette</DialogTitle>
          <DialogDescription>Search for a command to run</DialogDescription>
        </DialogHeader>

        {/* cmdk's fuzzy filter would hide the date page's single dynamic result, so we disable it: */}
        <Command shouldFilter={!isDatePage} onKeyDown={handleKeyDown}>
          <CommandInput
            placeholder={
              isDatePage ? "Type a date…" : prompt ? `Search ${prompt.name}s…` : "Type a command…"
            }
            value={search}
            onValueChange={setSearch}
          />

          <CommandList>
            {command && isDatePage ? (
              <DatePage
                search={search}
                heading={command.label.replace(/…$/, "")}
                onSelect={(date) => run(`${command.id}:${date.toString()}`)}
              />
            ) : command && prompt && choices ? (
              <>
                <CommandEmpty>No {prompt.name}s found.</CommandEmpty>
                <CommandGroup heading={capitalize(prompt.name)}>
                  {choices.map((choice) => (
                    <CommandItem
                      key={choice.value}
                      value={choice.label}
                      keywords={[prompt.name]}
                      onSelect={() => run(`${command.id}:${choice.value}`)}
                    >
                      <span>{choice.label}</span>
                      {choice.value === current[command.id as CommandId] && (
                        <CheckIcon className="ml-auto size-4" />
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            ) : (
              <>
                <CommandEmpty>No commands found.</CommandEmpty>
                <RootCommands values={values} goToPage={goToPage} run={run} />
              </>
            )}
          </CommandList>

          <PaletteFooter escAction={page === "root" ? "close" : "back"} />
        </Command>
      </DialogContent>
    </Dialog>
  )
}

function RootCommands({
  values,
  goToPage,
  run,
}: {
  values: CommandValues
  goToPage: (next: PalettePage) => void
  run: (action: string) => void
}) {
  const { bindings } = useKeyBindings()
  const entries = paletteEntries(values)

  return COMMAND_GROUPS.map((group) => (
    <CommandGroup key={group} heading={group}>
      {entries
        .filter((entry) => entry.group === group)
        .map((entry) => {
          const binding = bindings.find((b) => b.action === entry.action && !b.hidden)
          const { prompt } = entry

          return (
            <CommandItem
              key={entry.action}
              value={entry.label}
              keywords={[group]}
              onSelect={() => (prompt ? goToPage(prompt) : run(entry.action))}
            >
              <span>{entry.label}</span>
              {prompt ? (
                <ChevronRightIcon className="ml-auto size-4 opacity-50" />
              ) : (
                binding && (
                  <span className="ml-auto">
                    <ShortcutKeys keys={binding.keys} />
                  </span>
                )
              )}
            </CommandItem>
          )
        })}
    </CommandGroup>
  ))
}

function DatePage({
  search,
  heading,
  onSelect,
}: {
  search: string
  heading: string
  onSelect: (date: Temporal.PlainDate) => void
}) {
  const date = useMemo(() => {
    const start = parseEventText(search).start
    return start ? dateInViewerZone(start) : null
  }, [search])

  if (!date) {
    return (
      <div className="text-muted-foreground px-3 py-6 text-center text-sm">
        {search ? "No matching date" : `e.g. "5 Sep", "next sunday"...`}
      </div>
    )
  }

  return (
    <CommandGroup heading={heading}>
      {/* A constant value keeps cmdk's selection stable as the label changes. */}
      <CommandItem value="date-result" onSelect={() => onSelect(date)}>
        {formatLongDate(date)}
      </CommandItem>
    </CommandGroup>
  )
}

function PaletteFooter({ escAction }: { escAction: "close" | "back" }) {
  return (
    <div className="text-muted-foreground flex items-center gap-4 border-t px-3 py-2 text-xs">
      <span className="flex items-center gap-1.5">
        <KbdGroup>
          <Kbd>
            <ArrowRightIcon className="-rotate-90" />
          </Kbd>
          <Kbd>
            <ArrowRightIcon className="rotate-90" />
          </Kbd>
        </KbdGroup>
        navigate
      </span>
      <span className="flex items-center gap-1.5">
        <Kbd>Enter</Kbd>
        select
      </span>
      <span className="flex items-center gap-1.5">
        <Kbd>Esc</Kbd>
        {escAction}
      </span>
    </div>
  )
}
