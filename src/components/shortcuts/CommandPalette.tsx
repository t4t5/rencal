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

import { formatLongDate, toInteropDate } from "@/lib/event-time"
import { parseEventText } from "@/lib/magic-parser"
import {
  COMMAND_GROUPS,
  PALETTE_COMMANDS,
  type PalettePage,
  type PaletteSubmenu,
  type SubmenuConfig,
} from "@/lib/palette-commands"
import { ShortcutDef, ShortcutId, SHORTCUTS } from "@/lib/shortcuts"

import { ArrowRightIcon } from "@/icons/arrow-right"
import { CheckIcon } from "@/icons/check"
import { ChevronRightIcon } from "@/icons/chevron-right"

const SHORTCUT_BY_ID = Object.fromEntries(SHORTCUTS.map((s) => [s.id, s])) as Record<
  string,
  ShortcutDef
>

type Page = "root" | PaletteSubmenu | PalettePage

export function CommandPalette({
  open,
  onOpenChange,
  requestedPage = "root",
  handlers,
  submenus,
  onGoToDate,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  requestedPage?: "root" | PalettePage
  handlers: Record<ShortcutId, (e?: KeyboardEvent) => void>
  submenus: Partial<Record<PaletteSubmenu, SubmenuConfig>>
  onGoToDate: (date: Date) => void
}) {
  const [page, setPage] = useState<Page>("root")
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

  const goToPage = (next: Page) => {
    setSearch("")
    setPage(next)
  }

  const run = (action: () => void) => {
    pendingRef.current = action
    onOpenChange(false)
  }

  // Backspace on an empty query steps back out of a sub-page.
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (page !== "root" && e.key === "Backspace" && search === "") {
      e.preventDefault()
      goToPage("root")
    }
  }

  // The date page drives its own dynamic content rather than a static submenu.
  const isGoToDatePage = page === "go-to-date"

  const submenu = page === "root" || isGoToDatePage ? null : (submenus[page] ?? null)

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
        <Command shouldFilter={!isGoToDatePage} onKeyDown={handleKeyDown}>
          <CommandInput
            placeholder={
              isGoToDatePage ? "Type a date…" : submenu ? submenu.placeholder : "Type a command…"
            }
            value={search}
            onValueChange={setSearch}
          />

          <CommandList>
            <CommandListContent
              isGoToDatePage={isGoToDatePage}
              submenu={submenu}
              search={search}
              submenus={submenus}
              goToPage={goToPage}
              run={run}
              handlers={handlers}
              onGoToDate={onGoToDate}
            />
          </CommandList>

          <PaletteFooter page={page} />
        </Command>
      </DialogContent>
    </Dialog>
  )
}

function CommandListContent({
  isGoToDatePage,
  submenu,
  search,
  submenus,
  goToPage,
  run,
  handlers,
  onGoToDate,
}: {
  isGoToDatePage: boolean
  submenu: SubmenuConfig | null
  search: string
  submenus: Partial<Record<PaletteSubmenu, SubmenuConfig>>
  goToPage: (next: Page) => void
  run: (action: () => void) => void
  handlers: Record<ShortcutId, (e?: KeyboardEvent) => void>
  onGoToDate: (date: Date) => void
}) {
  if (isGoToDatePage) {
    return <GoToDatePage search={search} onSelect={(date) => run(() => onGoToDate(date))} />
  }

  if (submenu) {
    return (
      <>
        <CommandEmpty>{submenu.empty}</CommandEmpty>
        <CommandGroup heading={submenu.heading}>
          {submenu.items.map((item) => (
            <CommandItem
              key={item.id}
              value={item.label}
              keywords={[submenu.heading]}
              onSelect={() => run(() => submenu.onSelect(item.id))}
            >
              <span>{item.label}</span>
              {item.id === submenu.activeId && <CheckIcon className="ml-auto size-4" />}
            </CommandItem>
          ))}
        </CommandGroup>
      </>
    )
  }

  return (
    <>
      <CommandEmpty>No commands found.</CommandEmpty>
      <RootCommands submenus={submenus} goToPage={goToPage} run={run} handlers={handlers} />
    </>
  )
}

function RootCommands({
  submenus,
  goToPage,
  run,
  handlers,
}: {
  submenus: Partial<Record<PaletteSubmenu, SubmenuConfig>>
  goToPage: (next: Page) => void
  run: (action: () => void) => void
  handlers: Record<ShortcutId, (e?: KeyboardEvent) => void>
}) {
  return COMMAND_GROUPS.map((group) => (
    <CommandGroup key={group} heading={group}>
      {PALETTE_COMMANDS.filter(
        (command) => command.group === group && (!command.submenu || submenus[command.submenu]),
      ).map((command) => {
        const def = SHORTCUT_BY_ID[command.id]
        const label = command.label ?? def.label
        const binding = def.bindings.find((b) => !b.hidden)
        const drill = command.submenu ?? command.page

        return (
          <CommandItem
            key={command.id}
            value={label}
            keywords={[group]}
            onSelect={() => (drill ? goToPage(drill) : run(() => handlers[command.id]()))}
          >
            <span>{label}</span>
            {drill ? (
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

function GoToDatePage({ search, onSelect }: { search: string; onSelect: (date: Date) => void }) {
  const date = useMemo(() => {
    const start = parseEventText(search).start
    return start ? toInteropDate(start) : null
  }, [search])

  if (!date) {
    return (
      <div className="text-muted-foreground px-3 py-6 text-center text-sm">
        {search ? "No matching date" : "Type a date…"}
      </div>
    )
  }

  return (
    <CommandGroup heading="Go to date">
      {/* A constant value keeps cmdk's selection stable as the label changes. */}
      <CommandItem value="go-to-date-result" onSelect={() => onSelect(date)}>
        {formatLongDate(date)}
      </CommandItem>
    </CommandGroup>
  )
}

function PaletteFooter({ page }: { page: Page }) {
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
        {page === "root" ? "close" : "back"}
      </span>
    </div>
  )
}
