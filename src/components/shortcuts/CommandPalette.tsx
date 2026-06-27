import { useRef } from "react"

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

import { COMMAND_GROUPS, PALETTE_COMMANDS } from "@/lib/commands"
import { ShortcutDef, ShortcutId, SHORTCUTS } from "@/lib/shortcuts"

const SHORTCUT_BY_ID = Object.fromEntries(SHORTCUTS.map((s) => [s.id, s])) as Record<
  string,
  ShortcutDef
>

export function CommandPalette({
  open,
  onOpenChange,
  handlers,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  handlers: Record<ShortcutId, (e?: KeyboardEvent) => void>
}) {
  // Defer the action until the dialog has fully closed so Radix's focus restore
  // doesn't fight with focus that actions like search/compose set themselves.
  const pendingRef = useRef<(() => void) | null>(null)

  const run = (id: ShortcutId) => {
    pendingRef.current = () => handlers[id]()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="gap-0 overflow-hidden p-0 sm:max-w-xl"
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

        <Command>
          <CommandInput placeholder="Type a command…" />

          <CommandList>
            <CommandEmpty>No commands found.</CommandEmpty>

            {COMMAND_GROUPS.map((group) => (
              <CommandGroup key={group} heading={group}>
                {PALETTE_COMMANDS.filter((command) => command.group === group).map((command) => {
                  const def = SHORTCUT_BY_ID[command.id]
                  const label = command.label ?? def.label
                  const binding = def.bindings.find((b) => !b.hidden)

                  return (
                    <CommandItem
                      key={command.id}
                      value={label}
                      keywords={[group]}
                      onSelect={() => run(command.id)}
                    >
                      <span>{label}</span>
                      {binding && (
                        <span className="ml-auto">
                          <ShortcutKeys keys={binding.keys} />
                        </span>
                      )}
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            ))}
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
              close
            </span>
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  )
}
