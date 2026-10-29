import type { ReactNode } from "react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ItemContent, ItemMedia } from "@/components/ui/item"
import { SelectMenuTrigger } from "@/components/ui/select"

import type { AvailabilityDraft } from "@/lib/api"
import { DAY_MINUTES, HOUR_MINUTES } from "@/lib/event-time"
import { cn } from "@/lib/utils"

import { ArrowRightFromLineIcon } from "@/icons/arrow-right-from-line"
import { ArrowRightToLineIcon } from "@/icons/arrow-right-to-line"
import { CheckIcon } from "@/icons/check"

const WEEK_MINUTES = 7 * DAY_MINUTES

const NOTICE_MINUTES = [
  0,
  15,
  30,
  HOUR_MINUTES,
  4 * HOUR_MINUTES,
  DAY_MINUTES,
  2 * DAY_MINUTES,
  WEEK_MINUTES,
]
const HORIZON_DAYS = [7, 14, 30, 60, 90]

/** Short form for durations, e.g. "30 min", "1 h". */
export function formatMinutes(minutes: number): string {
  if (minutes > 0 && minutes % DAY_MINUTES === 0) return plural(minutes / DAY_MINUTES, "day")
  if (minutes > 0 && minutes % HOUR_MINUTES === 0) return `${minutes / HOUR_MINUTES} h`
  return `${minutes} min`
}

function formatNotice(minutes: number): string {
  if (minutes > 0 && minutes % WEEK_MINUTES === 0) return plural(minutes / WEEK_MINUTES, "week")
  if (minutes > 0 && minutes % DAY_MINUTES === 0) return plural(minutes / DAY_MINUTES, "day")
  if (minutes > 0 && minutes % HOUR_MINUTES === 0) return plural(minutes / HOUR_MINUTES, "hour")
  return plural(minutes, "minute")
}

const plural = (count: number, unit: string) => `${count} ${unit}${count === 1 ? "" : "s"}`

/** Presets, plus the current value when a file holds one that isn't a preset. */
const withValue = (presets: number[], value: number) =>
  presets.includes(value) ? presets : [...presets, value].sort((a, b) => a - b)

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
      <PresetMenu
        icon={<ArrowRightFromLineIcon />}
        value={draft.notice_minutes}
        options={withValue(NOTICE_MINUTES, draft.notice_minutes)}
        format={(minutes) => (minutes === 0 ? "None" : formatNotice(minutes))}
        label="minimum notice"
        onChange={(notice_minutes) => onChange({ notice_minutes })}
      />
      <PresetMenu
        icon={<ArrowRightToLineIcon />}
        value={draft.horizon_days}
        options={withValue(HORIZON_DAYS, draft.horizon_days)}
        format={(days) => plural(days, "day")}
        label="maximum window"
        onChange={(horizon_days) => onChange({ horizon_days })}
      />
    </section>
  )
}

function PresetMenu({
  icon,
  value,
  options,
  format,
  label,
  onChange,
}: {
  icon: ReactNode
  value: number
  options: number[]
  format: (value: number) => string
  label: string
  onChange: (value: number) => void
}) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <SelectMenuTrigger controlLayout className="w-full justify-start">
          <ItemMedia>{icon}</ItemMedia>
          <ItemContent className="overflow-hidden text-left">
            <span className="block truncate">
              {format(value)} <span className="text-muted-foreground">{label}</span>
            </span>
          </ItemContent>
        </SelectMenuTrigger>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-(--radix-dropdown-menu-trigger-width)">
        {options.map((option) => (
          <DropdownMenuItem
            key={option}
            onSelect={() => onChange(option)}
            className="gap-(--control-content-gap)"
          >
            <ItemContent>{format(option)}</ItemContent>
            <CheckIcon className={cn(option !== value && "invisible")} />
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
