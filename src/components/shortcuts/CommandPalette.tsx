import { useEffect, useRef, useState } from "react"

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

import {
  COMMAND_GROUPS,
  PALETTE_COMMANDS,
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

type Page = "root" | PaletteSubmenu

export function CommandPalette({
  open,
  onOpenChange,
  handlers,
  submenus,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  handlers: Record<ShortcutId, (e?: KeyboardEvent) => void>
  submenus: Partial<Record<PaletteSubmenu, SubmenuConfig>>
}) {
  const [page, setPage] = useState<Page>("root")
  const [search, setSearch] = useState("")

  // Defer the action until the dialog has fully closed so Radix's focus restore
  // doesn't fight with focus that actions like search/compose set themselves.
  const pendingRef = useRef<(() => void) | null>(null)

  // Always reopen at the root page with a clear query.
  useEffect(() => {
    if (!open) {
      setPage("root")
      setSearch("")
    }
  }, [open])

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

  const submenu = page === "root" ? null : (submenus[page] ?? null)

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

        <Command onKeyDown={handleKeyDown}>
          <CommandInput
            placeholder={submenu ? submenu.placeholder : "Type a command…"}
            value={search}
            onValueChange={setSearch}
          />

          <CommandList>
            <CommandEmpty>{submenu ? submenu.empty : "No commands found."}</CommandEmpty>

            {submenu ? (
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
            ) : (
              <RootCommands submenus={submenus} goToPage={goToPage} run={run} handlers={handlers} />
            )}
          </CommandList>

          <PaletteFooter page={page} />
        </Command>
      </DialogContent>
    </Dialog>
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

        return (
          <CommandItem
            key={command.id}
            value={label}
            keywords={[group]}
            onSelect={() =>
              command.submenu ? goToPage(command.submenu) : run(() => handlers[command.id]())
            }
          >
            <span>{label}</span>
            {command.submenu ? (
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
