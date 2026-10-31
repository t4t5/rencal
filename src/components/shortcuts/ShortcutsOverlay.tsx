import { useMemo, useState } from "react"

import { ShortcutKeys } from "@/components/shortcuts/ShortcutKeys"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"

import { useKeyBindings } from "@/contexts/KeyBindingsContext"

import {
  COMMAND_GROUPS,
  type CommandGroup,
  type CommandValues,
  describeAction,
} from "@/lib/commands"
import type { Binding } from "@/lib/key-bindings"

import { CloseIcon } from "@/icons/close"
import { SearchIcon } from "@/icons/search"

interface ShortcutRowData {
  action: string
  label: string
  group: CommandGroup
  keys: string[]
}

// One row per action, in the order its first binding comes.
function shortcutRows(bindings: readonly Binding[], values: CommandValues): ShortcutRowData[] {
  const rows = new Map<string, ShortcutRowData>()
  for (const binding of bindings) {
    if (binding.hidden) continue
    const row = rows.get(binding.action)
    if (row) {
      row.keys.push(binding.keys)
      continue
    }
    const described = describeAction(binding.action, values)
    if (described)
      rows.set(binding.action, { action: binding.action, ...described, keys: [binding.keys] })
  }
  return [...rows.values()]
}

export function ShortcutsOverlay({
  open,
  onClose,
  values,
}: {
  open: boolean
  onClose: () => void
  values: CommandValues
}) {
  const { bindings, errors } = useKeyBindings()
  const [query, setQuery] = useState("")
  const normalizedQuery = query.trim().toLowerCase()
  const rows = useMemo(() => shortcutRows(bindings, values), [bindings, values])
  const filteredRows = useMemo(
    () =>
      normalizedQuery
        ? rows.filter(
            (row) =>
              row.label.toLowerCase().includes(normalizedQuery) ||
              row.group.toLowerCase().includes(normalizedQuery) ||
              row.keys.some((keys) => keys.includes(normalizedQuery)),
          )
        : rows,
    [normalizedQuery, rows],
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
              <Button variant="ghost" size="icon-xs" aria-label="Close keyboard shortcuts">
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
              variant="default"
              className="h-10 pr-3 pl-9"
            />
          </div>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
          {errors.length > 0 && (
            <div className="text-destructive mb-6 flex flex-col gap-1 text-sm" role="alert">
              {errors.map((error) => (
                <p key={error}>{error}</p>
              ))}
            </div>
          )}

          {filteredRows.length > 0 ? (
            <div className="flex flex-col gap-7 pb-4">
              {COMMAND_GROUPS.map((group) => (
                <ShortcutGroupSection key={group} group={group} rows={filteredRows} />
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground py-10 text-center text-sm">No shortcuts found</p>
          )}

          <p className="text-muted-foreground border-t pt-4 text-xs">
            Change keys in <code>~/.config/rencal/keys.toml</code>.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function ShortcutGroupSection({
  group,
  rows,
}: {
  group: CommandGroup
  rows: readonly ShortcutRowData[]
}) {
  const groupRows = rows.filter((row) => row.group === group)
  if (groupRows.length === 0) return null

  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-foreground text-sm font-semibold">{group}</h3>

      {groupRows.map((row) => (
        <ShortcutRow key={row.action} row={row} />
      ))}
    </section>
  )
}

function ShortcutRow({ row }: { row: ShortcutRowData }) {
  return (
    <div className="flex min-h-8 items-center justify-between gap-4 text-sm">
      <span className="text-muted-foreground">{row.label}</span>

      <div className="flex shrink-0 items-center gap-1.5">
        {row.keys.map((keys, i) => (
          <span key={keys} className="flex items-center gap-1.5">
            {i > 0 && <span className="text-muted-foreground text-xs">or</span>}
            <ShortcutKeys keys={keys} />
          </span>
        ))}
      </div>
    </div>
  )
}
