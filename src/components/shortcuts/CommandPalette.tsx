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

import { COMMAND_GROUPS, PALETTE_COMMANDS, type PaletteSubmenu } from "@/lib/commands"
import { ShortcutDef, ShortcutId, SHORTCUTS } from "@/lib/shortcuts"

import { CheckIcon } from "@/icons/check"
import { ChevronRightIcon } from "@/icons/chevron-right"
import type { ThemeDescriptor } from "@/themes/manifest"

const SHORTCUT_BY_ID = Object.fromEntries(SHORTCUTS.map((s) => [s.id, s])) as Record<
  string,
  ShortcutDef
>

type Page = "root" | PaletteSubmenu

export function CommandPalette({
  open,
  onOpenChange,
  handlers,
  themes,
  currentTheme,
  onSelectTheme,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  handlers: Record<ShortcutId, (e?: KeyboardEvent) => void>
  themes: ThemeDescriptor[]
  currentTheme: string
  onSelectTheme: (id: string) => void
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
            placeholder={page === "theme" ? "Search themes…" : "Type a command…"}
            value={search}
            onValueChange={setSearch}
          />

          <CommandList>
            <CommandEmpty>
              {page === "theme" ? "No themes found." : "No commands found."}
            </CommandEmpty>

            {page === "root"
              ? COMMAND_GROUPS.map((group) => (
                  <CommandGroup key={group} heading={group}>
                    {PALETTE_COMMANDS.filter((command) => command.group === group).map(
                      (command) => {
                        const def = SHORTCUT_BY_ID[command.id]
                        const label = command.label ?? def.label
                        const binding = def.bindings.find((b) => !b.hidden)

                        return (
                          <CommandItem
                            key={command.id}
                            value={label}
                            keywords={[group]}
                            onSelect={() =>
                              command.submenu
                                ? goToPage(command.submenu)
                                : run(() => handlers[command.id]())
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
                      },
                    )}
                  </CommandGroup>
                ))
              : page === "theme" && (
                  <CommandGroup heading="Theme">
                    {themes.map((theme) => (
                      <CommandItem
                        key={theme.id}
                        value={theme.name}
                        keywords={["theme", theme.id]}
                        onSelect={() => run(() => onSelectTheme(theme.id))}
                      >
                        <span>{theme.name}</span>
                        {theme.id === currentTheme && <CheckIcon className="ml-auto size-4" />}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
          </CommandList>

          <div className="text-muted-foreground flex items-center gap-4 border-t px-3 py-2 text-xs">
            <span className="flex items-center gap-1.5">
              <KbdGroup>
                <Kbd>↑</Kbd>
                <Kbd>↓</Kbd>
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
        </Command>
      </DialogContent>
    </Dialog>
  )
}
