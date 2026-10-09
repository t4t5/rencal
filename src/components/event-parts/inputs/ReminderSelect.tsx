import { plural, t } from "@lingui/core/macro"
import { ReactNode, useState } from "react"

import { Combobox } from "@/components/ui/combo-box"
import { CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command"
import { Item, ItemActions, ItemContent, ItemMedia } from "@/components/ui/item"

import { DAY_MINUTES, HOUR_MINUTES, MONTH_MINUTES, WEEK_MINUTES } from "@/lib/event-time"
import { cn } from "@/lib/utils"

import { BellIcon } from "@/icons/bell"

import { RemoveItemButton } from "./RemoveItemButton"

const DEFAULT_REMINDER_VALUES = [
  0, // At time of event
  10, // 10 mins before
  30, // 30 mins before
  60, // 1 hour before
]

const REMINDER_UNITS = [
  { pattern: /^(m|min|mins|minute|minutes)$/i, toMinutes: (num: number) => num },
  { pattern: /^(h|hr|hrs|hour|hours)$/i, toMinutes: (num: number) => num * HOUR_MINUTES },
  { pattern: /^(d|day|days)$/i, toMinutes: (num: number) => num * DAY_MINUTES },
  { pattern: /^(w|wk|wks|week|weeks)$/i, toMinutes: (num: number) => num * WEEK_MINUTES },
  { pattern: /^(mo|mon|month|months)$/i, toMinutes: (num: number) => num * MONTH_MINUTES },
]

function uniqueValues(values: number[]): number[] {
  return [...new Set(values)]
}

function getQueryValues(query: string): number[] {
  const match = query.trim().match(/^(\d+)\s*([a-z]*)/i)
  if (!match) return []

  const num = parseInt(match[1], 10)
  if (num <= 0) return []

  const unitQuery = match[2]
  if (unitQuery) {
    const unit = REMINDER_UNITS.find(({ pattern }) => pattern.test(unitQuery))
    return unit ? [unit.toMinutes(num)] : []
  }

  return uniqueValues([
    num, // minutes
    num * HOUR_MINUTES, // hours
    num * DAY_MINUTES, // days
    num * WEEK_MINUTES, // weeks
    num * MONTH_MINUTES, // months
  ])
}

function humanDuration(mins: number): string {
  if (mins === 0) return t`At time of event`

  if (mins < 0) {
    // Negative means "after event start" — used for all-day event reminders
    // e.g. -480 mins = 8 hours after midnight = 08:00 on day of event
    const afterMins = -mins
    const h = Math.floor(afterMins / 60)
      .toString()
      .padStart(2, "0")
    const m = (afterMins % 60).toString().padStart(2, "0")
    const time = `${h}:${m}`
    return t`On day of event (${time})`
  }

  const months = Math.floor(mins / MONTH_MINUTES)
  const weeks = Math.floor((mins % MONTH_MINUTES) / WEEK_MINUTES)
  const days = Math.floor((mins % WEEK_MINUTES) / DAY_MINUTES)
  const hours = Math.floor((mins % DAY_MINUTES) / HOUR_MINUTES)
  const minutes = mins % HOUR_MINUTES

  return [
    months > 0 && plural(months, { one: "# month", other: "# months" }),
    weeks > 0 && plural(weeks, { one: "# week", other: "# weeks" }),
    days > 0 && plural(days, { one: "# day", other: "# days" }),
    hours > 0 && plural(hours, { one: "# hour", other: "# hours" }),
    minutes > 0 && plural(minutes, { one: "# minute", other: "# minutes" }),
  ]
    .filter((part) => part !== false)
    .join(", ")
}

// Stands in for the duration inside the translated "… before" phrase, so the
// words around it can keep their muted style.
const DURATION_SLOT = "\u0000duration\u0000"

export function ReminderSelect({
  reminders,
  onSelect,
  onRemove,
  placeholder,
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

  const values = query ? getQueryValues(query) : DEFAULT_REMINDER_VALUES

  // cmdk drops the highlight when its row disappears; re-pin it to the first
  // option so Enter always has something to pick.
  const handleQueryChange = (next: string) => {
    setQuery(next)
    const [first] = next ? getQueryValues(next) : DEFAULT_REMINDER_VALUES
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
        placeholder={placeholder ?? t`Reminders`}
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
          <CommandEmpty>{t`No results found.`}</CommandEmpty>
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
  if (mins <= 0) {
    return (
      <span className="flex gap-1.5 items-baseline">
        <span>{humanDuration(mins)}</span>
      </span>
    )
  }

  const duration = DURATION_SLOT
  const [prefix = "", suffix = ""] = t({
    message: `${duration} before`,
    context: "reminder offset",
  })
    .split(DURATION_SLOT)
    .map((part) => part.trim())

  return (
    <span className="flex gap-1.5 items-baseline">
      {prefix && <span className="text-muted-foreground">{prefix}</span>}
      <span>{humanDuration(mins)}</span>
      {suffix && <span className="text-muted-foreground">{suffix}</span>}
    </span>
  )
}
