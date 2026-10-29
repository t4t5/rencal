import { ReactNode, useState } from "react"

import { Combobox } from "@/components/ui/combo-box"
import { CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command"
import { Item, ItemActions, ItemContent, ItemMedia } from "@/components/ui/item"

import { durationQueryValues, formatDuration, MINUTE_UNITS } from "@/lib/duration-query"
import { cn } from "@/lib/utils"

import { BellIcon } from "@/icons/bell"

import { RemoveItemButton } from "./RemoveItemButton"

const DEFAULT_REMINDER_VALUES = [
  0, // At time of event
  10, // 10 mins before
  30, // 30 mins before
  60, // 1 hour before
]

function humanDuration(mins: number): string {
  if (mins === 0) return "At time of event"

  if (mins < 0) {
    // Negative means "after event start" — used for all-day event reminders
    // e.g. -480 mins = 8 hours after midnight = 08:00 on day of event
    const afterMins = -mins
    const h = Math.floor(afterMins / 60)
      .toString()
      .padStart(2, "0")
    const m = (afterMins % 60).toString().padStart(2, "0")
    return `On day of event (${h}:${m})`
  }

  return formatDuration(mins, MINUTE_UNITS)
}

export function ReminderSelect({
  reminders,
  onSelect,
  onRemove,
  placeholder = "Reminders",
  addon,
  variant,
  indentRows = true,
}: {
  reminders: number[]
  onSelect: (mins: number) => void
  onRemove: (mins: number) => void
  placeholder?: string
  addon?: ReactNode
  variant?: "ghost" | "default"
  indentRows?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [highlighted, setHighlighted] = useState(String(DEFAULT_REMINDER_VALUES[0]))

  const values = query ? durationQueryValues(query, MINUTE_UNITS) : DEFAULT_REMINDER_VALUES

  // cmdk drops the highlight when its row disappears; re-pin it to the first
  // option so Enter always has something to pick.
  const handleQueryChange = (next: string) => {
    setQuery(next)
    const [first] = next ? durationQueryValues(next, MINUTE_UNITS) : DEFAULT_REMINDER_VALUES
    if (first !== undefined) setHighlighted(String(first))
  }
  const resolvedAddon =
    addon === undefined ? (
      <ItemMedia>
        <BellIcon />
      </ItemMedia>
    ) : (
      addon
    )

  return (
    <div className="flex flex-col gap-1">
      <Combobox
        placeholder={placeholder}
        query={query}
        setQuery={handleQueryChange}
        open={open}
        setOpen={setOpen}
        addon={resolvedAddon}
        variant={variant}
        highlightedValue={highlighted}
        onHighlightChange={setHighlighted}
      >
        {values.length ? (
          <CommandGroup>
            {values.map((mins) => (
              <CommandItem
                key={mins}
                value={String(mins)}
                onSelect={() => {
                  if (!reminders.includes(mins)) onSelect(mins)
                  setOpen(false)
                  handleQueryChange("")
                }}
              >
                <HumanDuration mins={mins} />
              </CommandItem>
            ))}
          </CommandGroup>
        ) : (
          <CommandEmpty>No results found.</CommandEmpty>
        )}
      </Combobox>

      {reminders
        .sort((a, b) => a - b)
        .map((mins) => (
          <ReminderRow
            key={mins}
            mins={mins}
            onRemove={() => onRemove(mins)}
            indented={indentRows}
          />
        ))}
    </div>
  )
}

const ReminderRow = ({
  mins,
  className,
  onRemove,
  indented,
}: {
  mins: number
  className?: string
  onRemove: () => void
  indented?: boolean
}) => {
  return (
    <Item
      key={mins}
      variant="accent"
      className={cn("cursor-default", !indented && "gap-0", className)}
    >
      {indented && <ItemMedia aria-hidden="true" />}
      <ItemContent>
        <HumanDuration mins={mins} />
      </ItemContent>
      <ItemActions>
        <RemoveItemButton onClick={onRemove} />
      </ItemActions>
    </Item>
  )
}

const HumanDuration = ({ mins }: { mins: number }) => {
  return (
    <span className="flex gap-1.5 items-baseline">
      <span>{humanDuration(mins)}</span>
      {mins > 0 && <span className="text-muted-foreground">before</span>}
    </span>
  )
}
