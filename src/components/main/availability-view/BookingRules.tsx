import { useState } from "react"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

import type { AvailabilityDraft } from "@/lib/api"
import { DAY_MINUTES, HOUR_MINUTES } from "@/lib/event-time"
import { cn } from "@/lib/utils"

import { ChevronRightIcon } from "@/icons/chevron-right"

type Unit = "minutes" | "hours" | "days"

const UNIT_MINUTES: Record<Unit, number> = { minutes: 1, hours: HOUR_MINUTES, days: DAY_MINUTES }

export function formatMinutes(minutes: number): string {
  if (minutes > 0 && minutes % DAY_MINUTES === 0) {
    const days = minutes / DAY_MINUTES
    return `${days} ${days === 1 ? "day" : "days"}`
  }
  if (minutes > 0 && minutes % HOUR_MINUTES === 0) return `${minutes / HOUR_MINUTES} h`
  return `${minutes} min`
}

/** e.g. "10 min after · 1 day notice · 60 days ahead". */
export function bookingRulesSummary(draft: AvailabilityDraft): string {
  const parts = [
    draft.buffer_before_minutes > 0 && `${formatMinutes(draft.buffer_before_minutes)} before`,
    draft.buffer_after_minutes > 0 && `${formatMinutes(draft.buffer_after_minutes)} after`,
    draft.notice_minutes > 0 && `${formatMinutes(draft.notice_minutes)} notice`,
    `${draft.horizon_days} ${draft.horizon_days === 1 ? "day" : "days"} ahead`,
  ]
  return parts.filter(Boolean).join(" · ")
}

const toCount = (value: string) => Math.max(0, Math.floor(Number(value) || 0))

export function BookingRules({
  draft,
  onChange,
}: {
  draft: AvailabilityDraft
  onChange: (patch: Partial<AvailabilityDraft>) => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <div data-slot="availability-booking-rules" className="flex flex-col gap-3">
      <button
        type="button"
        className="flex items-center gap-1 text-sm text-left"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <ChevronRightIcon className={cn("size-4 transition-transform", open && "rotate-90")} />
        <span className="font-medium">Booking rules</span>
        {!open && (
          <span className="truncate text-muted-foreground">· {bookingRulesSummary(draft)}</span>
        )}
      </button>

      {open && (
        <div className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2 pl-5">
          <MinutesField
            id="availability-buffer-before"
            label="Buffer before"
            value={draft.buffer_before_minutes}
            onChange={(buffer_before_minutes) => onChange({ buffer_before_minutes })}
          />
          <MinutesField
            id="availability-buffer-after"
            label="Buffer after"
            value={draft.buffer_after_minutes}
            onChange={(buffer_after_minutes) => onChange({ buffer_after_minutes })}
          />
          <NoticeField
            value={draft.notice_minutes}
            onChange={(notice_minutes) => onChange({ notice_minutes })}
          />
          <Label htmlFor="availability-horizon" className="text-sm text-muted-foreground">
            Booking window
          </Label>
          <div className="flex items-center gap-2">
            <Input
              id="availability-horizon"
              type="number"
              min={1}
              className="w-20"
              value={draft.horizon_days}
              onChange={(e) => onChange({ horizon_days: Math.max(1, toCount(e.target.value)) })}
            />
            <span className="text-sm text-muted-foreground">days ahead</span>
          </div>
        </div>
      )}
    </div>
  )
}

function MinutesField({
  id,
  label,
  value,
  onChange,
}: {
  id: string
  label: string
  value: number
  onChange: (minutes: number) => void
}) {
  return (
    <>
      <Label htmlFor={id} className="text-sm text-muted-foreground">
        {label}
      </Label>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          type="number"
          min={0}
          step={5}
          className="w-20"
          value={value}
          onChange={(e) => onChange(toCount(e.target.value))}
        />
        <span className="text-sm text-muted-foreground">min</span>
      </div>
    </>
  )
}

function NoticeField({ value, onChange }: { value: number; onChange: (minutes: number) => void }) {
  const fitting: Unit =
    value > 0 && value % DAY_MINUTES === 0
      ? "days"
      : value > 0 && value % HOUR_MINUTES === 0
        ? "hours"
        : "minutes"
  const [unit, setUnit] = useState<Unit>(fitting)
  // A value that no longer divides (edited elsewhere) shows in a unit that fits.
  const shown: Unit = value % UNIT_MINUTES[unit] === 0 ? unit : fitting

  return (
    <>
      <Label htmlFor="availability-notice" className="text-sm text-muted-foreground">
        Minimum notice
      </Label>
      <div className="flex items-center gap-2">
        <Input
          id="availability-notice"
          type="number"
          min={0}
          className="w-20"
          value={value / UNIT_MINUTES[shown]}
          onChange={(e) => onChange(toCount(e.target.value) * UNIT_MINUTES[shown])}
        />
        <Select
          value={shown}
          onValueChange={(next) => {
            const nextUnit = next as Unit
            setUnit(nextUnit)
            onChange((value / UNIT_MINUTES[shown]) * UNIT_MINUTES[nextUnit])
          }}
        >
          <SelectTrigger variant="default" className="w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="minutes">minutes</SelectItem>
            <SelectItem value="hours">hours</SelectItem>
            <SelectItem value="days">days</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </>
  )
}
