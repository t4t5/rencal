import { type ReactNode, useState } from "react"

import { Combobox } from "@/components/ui/combo-box"
import { CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command"
import { ItemMedia } from "@/components/ui/item"

import type { AvailabilityDraft } from "@/lib/api"
import {
  type DurationUnit,
  durationQueryValues,
  formatDuration,
  MINUTE_UNITS,
} from "@/lib/duration-query"
import { DAY_MINUTES, HOUR_MINUTES, WEEK_MINUTES } from "@/lib/event-time"
import { cn } from "@/lib/utils"

import { ArrowRightFromLineIcon } from "@/icons/arrow-right-from-line"
import { ArrowRightToLineIcon } from "@/icons/arrow-right-to-line"

const NOTICE_PRESETS = [0, 30, HOUR_MINUTES, 4 * HOUR_MINUTES, DAY_MINUTES, WEEK_MINUTES]
const HORIZON_PRESETS = [7, 14, 30, 60, 90]

// The horizon is in days; a month is 30 of them, as booking windows count it.
const DAY_UNITS: DurationUnit[] = [
  { name: "day", pattern: /^(d|day|days)$/i, size: 1 },
  { name: "week", pattern: /^(w|wk|wks|week|weeks)$/i, size: 7 },
  { name: "month", pattern: /^(mo|mon|month|months)$/i, size: 30 },
]

/** Short form for durations, e.g. "30 min", "1 h". */
export function formatMinutes(minutes: number): string {
  if (minutes > 0 && minutes % DAY_MINUTES === 0) {
    const days = minutes / DAY_MINUTES
    return `${days} ${days === 1 ? "day" : "days"}`
  }
  if (minutes > 0 && minutes % HOUR_MINUTES === 0) return `${minutes / HOUR_MINUTES} h`
  return `${minutes} min`
}

const formatNotice = (minutes: number) =>
  minutes === 0 ? "No" : formatDuration(minutes, MINUTE_UNITS)

const formatHorizon = (days: number) => `${days} ${days === 1 ? "day" : "days"}`

export function BookingWindow({
  draft,
  onChange,
}: {
  draft: AvailabilityDraft
  onChange: (patch: Partial<AvailabilityDraft>) => void
}) {
  return (
    <section data-slot="availability-booking-window" className="flex flex-col gap-1">
      <span className="text-sm font-medium">Booking window</span>
      <DurationCombobox
        icon={<ArrowRightFromLineIcon />}
        label="minimum notice"
        value={draft.notice_minutes}
        presets={NOTICE_PRESETS}
        units={MINUTE_UNITS}
        format={formatNotice}
        onChange={(notice_minutes) => onChange({ notice_minutes })}
      />
      <DurationCombobox
        icon={<ArrowRightToLineIcon />}
        label="maximum window"
        value={draft.horizon_days}
        presets={HORIZON_PRESETS}
        units={DAY_UNITS}
        format={formatHorizon}
        onChange={(horizon_days) => onChange({ horizon_days })}
      />
    </section>
  )
}

/** Presets, or what the query could mean; type "36h" or "6 weeks" for any value. */
function DurationCombobox({
  icon,
  label,
  value,
  presets,
  units,
  format,
  onChange,
}: {
  icon: ReactNode
  label: string
  value: number
  presets: number[]
  units: DurationUnit[]
  format: (value: number) => string
  onChange: (value: number) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [highlighted, setHighlighted] = useState(String(value))

  // A file value that isn't a preset still shows, so it can be picked again.
  const defaults = presets.includes(value) ? presets : [...presets, value].sort((a, b) => a - b)
  const options = query ? durationQueryValues(query, units) : defaults

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    setQuery("")
    if (next) setHighlighted(String(value))
  }

  // cmdk drops the highlight when its row disappears; re-pin it to the first
  // option so Enter always has something to pick.
  const handleQueryChange = (next: string) => {
    setQuery(next)
    const [first] = next ? durationQueryValues(next, units) : [value]
    if (first !== undefined) setHighlighted(String(first))
  }

  const commit = (next: number) => {
    if (next !== value) onChange(next)
    handleOpenChange(false)
  }

  return (
    <Combobox
      addon={<ItemMedia>{icon}</ItemMedia>}
      suffix={<span className="flex-1 truncate text-sm text-muted-foreground">{label}</span>}
      inputClassName="flex-none [field-sizing:content]"
      placeholder={format(value)}
      query={open ? query : format(value)}
      setQuery={handleQueryChange}
      open={open}
      setOpen={handleOpenChange}
      highlightedValue={highlighted}
      onHighlightChange={setHighlighted}
    >
      {options.length ? (
        <CommandGroup>
          {options.map((option) => (
            <CommandItem
              key={option}
              value={String(option)}
              onSelect={() => commit(option)}
              className={cn("gap-1.5", option === value && "font-medium")}
            >
              <span>{format(option)}</span>
              <span className="text-muted-foreground">{label}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      ) : (
        <CommandEmpty>No results found.</CommandEmpty>
      )}
    </Combobox>
  )
}
