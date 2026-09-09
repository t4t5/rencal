import { useMemo, useState } from "react"

import { ShortcutKeys } from "@/components/shortcuts/ShortcutKeys"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"

import { ShortcutDef, ShortcutGroup, SHORTCUT_GROUPS, SHORTCUTS } from "@/lib/shortcuts"

import { CloseIcon } from "@/icons/close"
import { SearchIcon } from "@/icons/search"

export function ShortcutsOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState("")
  const normalizedQuery = query.trim().toLowerCase()
  const filteredShortcuts = useMemo(
    () =>
      normalizedQuery
        ? SHORTCUTS.filter(
            (shortcut) =>
              shortcut.label.toLowerCase().includes(normalizedQuery) ||
              shortcut.group.toLowerCase().includes(normalizedQuery) ||
              shortcut.bindings.some(
                (binding) =>
                  !("hidden" in binding && binding.hidden) &&
                  binding.keys.toLowerCase().includes(normalizedQuery),
              ),
          )
        : SHORTCUTS,
    [normalizedQuery],
  )

  return (
    <Sheet
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose()
      }}
    >
      <SheetContent className="w-full gap-0 p-0 sm:max-w-md">
        <SheetHeader className="shrink-0 gap-4 border-b p-5">
          <div className="flex items-center justify-between gap-4">
            <SheetTitle className="text-lg">Keyboard shortcuts</SheetTitle>

            <SheetClose asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Close keyboard shortcuts">
                <CloseIcon />
              </Button>
            </SheetClose>
          </div>

          <div className="relative">
            <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input
              autoFocus
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Find keyboard shortcuts"
              aria-label="Find keyboard shortcuts"
              ghost={false}
              className="h-10 pr-3 pl-9"
            />
          </div>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
          {filteredShortcuts.length > 0 ? (
            <div className="flex flex-col gap-7 pb-4">
              {SHORTCUT_GROUPS.map((group) => (
                <ShortcutGroupSection key={group} group={group} shortcuts={filteredShortcuts} />
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground py-10 text-center text-sm">No shortcuts found</p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

function ShortcutGroupSection({
  group,
  shortcuts,
}: {
  group: ShortcutGroup
  shortcuts: readonly ShortcutDef[]
}) {
  const groupShortcuts = shortcuts.filter((shortcut) => shortcut.group === group)
  if (groupShortcuts.length === 0) return null

  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-foreground text-sm font-semibold">{group}</h3>

      {groupShortcuts.map((shortcut) => (
        <ShortcutRow key={shortcut.id} shortcut={shortcut} />
      ))}
    </section>
  )
}

function ShortcutRow({ shortcut }: { shortcut: ShortcutDef }) {
  return (
    <div className="flex min-h-8 items-center justify-between gap-4 text-sm">
      <span className="text-muted-foreground">{shortcut.label}</span>

      <div className="flex shrink-0 items-center gap-1.5">
        {shortcut.bindings
          .filter((binding) => !binding.hidden)
          .map((binding, i) => (
            <span key={binding.keys} className="flex items-center gap-1.5">
              {i > 0 && <span className="text-muted-foreground text-xs">or</span>}
              <ShortcutKeys keys={binding.keys} />
            </span>
          ))}
      </div>
    </div>
  )
}
