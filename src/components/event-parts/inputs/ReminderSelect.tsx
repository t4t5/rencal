import { ReactNode, useState } from "react"

import { Combobox } from "@/components/ui/combo-box"
import { CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command"
import {
  ControlContent,
  ControlLeading,
  ControlRow,
  ControlTrailing,
} from "@/components/ui/control-row"

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

  const months = Math.floor(mins / MONTH_MINUTES)
  const weeks = Math.floor((mins % MONTH_MINUTES) / WEEK_MINUTES)
  const days = Math.floor((mins % WEEK_MINUTES) / DAY_MINUTES)
  const hours = Math.floor((mins % DAY_MINUTES) / HOUR_MINUTES)
  const minutes = mins % HOUR_MINUTES

  return [
    { value: months, unit: "month" },
    { value: weeks, unit: "week" },
    { value: days, unit: "day" },
    { value: hours, unit: "hour" },
    { value: minutes, unit: "minute" },
  ]
    .filter(({ value }) => value > 0)
    .map(({ value, unit }) => `${value} ${unit}${value === 1 ? "" : "s"}`)
    .join(", ")
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

  const values = query ? getQueryValues(query) : DEFAULT_REMINDER_VALUES
  const resolvedAddon =
    addon === undefined ? (
      <ControlLeading>
        <BellIcon />
      </ControlLeading>
    ) : (
      addon
    )

  return (
    <div className="flex flex-col gap-1">
      <Combobox
        placeholder={placeholder}
        query={query}
        setQuery={setQuery}
        open={open}
        setOpen={setOpen}
        addon={resolvedAddon}
        variant={variant}
      >
        {values.length ? (
          <CommandGroup>
            {values.map((mins) => (
              <CommandItem
                key={mins}
                onSelect={() => {
                  if (!reminders.includes(mins)) onSelect(mins)
                  setOpen(false)
                  setQuery("")
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
    <ControlRow
      key={mins}
      className={cn(
        "group h-control cursor-default rounded-md border border-transparent text-sm hover:bg-secondary focus-within:bg-secondary",
        !indented && "gap-0",
        className,
      )}
    >
      {indented && <ControlLeading aria-hidden="true" />}
      <ControlContent>
        <HumanDuration mins={mins} />
      </ControlContent>
      <ControlTrailing>
        <RemoveItemButton onClick={onRemove} />
      </ControlTrailing>
    </ControlRow>
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
