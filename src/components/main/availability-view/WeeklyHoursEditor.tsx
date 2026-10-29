import { Temporal } from "@js-temporal/polyfill"
import { useState } from "react"

import { RemoveItemButton } from "@/components/event-parts/inputs/RemoveItemButton"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

import { useSettings } from "@/contexts/SettingsContext"

import type { DayHours, Weekday } from "@/lib/api"
import { formatWallclockTime, formatWeekday, type TimeFormat } from "@/lib/event-time"
import { cn } from "@/lib/utils"

import { CopyIcon } from "@/icons/copy"
import { PlusIcon } from "@/icons/plus"

import { type HoursAction, invalidRange, WEEKDAYS } from "./hours-reducer"

// A Monday, for weekday names in the user's locale.
const MONDAY = Temporal.PlainDate.from("2026-01-05")

export const weekdayDate = (day: Weekday) => MONDAY.add({ days: WEEKDAYS.indexOf(day) })

const TIMES = Array.from({ length: 24 * 4 }, (_, i) => {
  const hour = Math.floor(i / 4)
  const minute = (i % 4) * 15
  return {
    value: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
    hour,
    minute,
  }
})

/** Weekdays in the user's week order. */
export function orderedWeekdays(firstDay: "monday" | "sunday"): Weekday[] {
  return firstDay === "sunday" ? ["su", ...WEEKDAYS.slice(0, 6)] : [...WEEKDAYS]
}

export function WeeklyHoursEditor({
  hours,
  dispatch,
}: {
  hours: DayHours[]
  dispatch: (action: HoursAction) => void
}) {
  const { firstDayOfWeek, timeFormat } = useSettings()
  const invalid = invalidRange(hours)

  return (
    <div data-slot="availability-hours-editor" className="flex flex-col gap-1">
      {orderedWeekdays(firstDayOfWeek).map((day) => {
        const ranges = hours.find((h) => h.day === day)?.ranges ?? []
        const on = ranges.length > 0
        const id = `availability-day-${day}`

        return (
          <div key={day} className="flex items-start gap-2 min-h-control">
            <div className="flex items-center gap-2 h-control w-16 shrink-0">
              <Checkbox
                id={id}
                checked={on}
                onCheckedChange={(checked) =>
                  dispatch({ type: "toggle", day, on: checked === true })
                }
              />
              <Label htmlFor={id} className="text-sm">
                {formatWeekday(weekdayDate(day), "short")}
              </Label>
            </div>

            <div className="flex flex-col gap-1 grow min-w-0">
              {!on && (
                <span className="h-control flex items-center text-sm text-muted-foreground">
                  Unavailable
                </span>
              )}
              {ranges.map((range, index) => (
                <div key={index} className="group flex items-center gap-1">
                  <TimeSelect
                    value={range.start}
                    timeFormat={timeFormat}
                    invalid={invalid?.day === day && invalid.index === index}
                    onChange={(start) => {
                      dispatch({ type: "set", day, index, range: { start } })
                      dispatch({ type: "merge", day })
                    }}
                  />
                  <span className="text-muted-foreground">–</span>
                  <TimeSelect
                    value={range.end}
                    timeFormat={timeFormat}
                    invalid={invalid?.day === day && invalid.index === index}
                    onChange={(end) => {
                      dispatch({ type: "set", day, index, range: { end } })
                      dispatch({ type: "merge", day })
                    }}
                  />
                  <RemoveItemButton onClick={() => dispatch({ type: "remove", day, index })} />
                </div>
              ))}
            </div>

            <div className="flex items-center h-control shrink-0">
              <Button
                variant="ghost"
                size="icon-sm"
                title="Add times"
                onClick={() => dispatch({ type: "add", day })}
              >
                <PlusIcon className="size-4" />
              </Button>
              {on && (
                <CopyTimesPopover
                  from={day}
                  onCopy={(to) => dispatch({ type: "copy", from: day, to })}
                />
              )}
            </div>
          </div>
        )
      })}
      {invalid && <p className="text-sm text-destructive">End times must be after start times.</p>}
    </div>
  )
}

function TimeSelect({
  value,
  timeFormat,
  invalid,
  onChange,
}: {
  value: string
  timeFormat: TimeFormat
  invalid: boolean
  onChange: (value: string) => void
}) {
  // A hand-edited file can hold off-grid times; keep them selectable.
  const options = TIMES.some((t) => t.value === value)
    ? TIMES
    : [
        ...TIMES,
        {
          value,
          hour: Number(value.slice(0, 2)),
          minute: Number(value.slice(3, 5)),
        },
      ].toSorted((a, b) => (a.value < b.value ? -1 : 1))

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger
        variant="default"
        aria-invalid={invalid || undefined}
        className={cn("w-[5.5rem] tabular-nums", invalid && "border-destructive")}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="max-h-64">
        {options.map((time) => (
          <SelectItem key={time.value} value={time.value} className="tabular-nums">
            {formatWallclockTime(time.hour, time.minute, timeFormat)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/** cal.com-style "Copy times to…". */
function CopyTimesPopover({ from, onCopy }: { from: Weekday; onCopy: (to: Weekday[]) => void }) {
  const { firstDayOfWeek } = useSettings()
  const [open, setOpen] = useState(false)
  const [targets, setTargets] = useState<Weekday[]>([])

  const toggle = (day: Weekday, checked: boolean) =>
    setTargets((current) => (checked ? [...current, day] : current.filter((d) => d !== day)))

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) setTargets([])
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon-sm" title="Copy times to…">
          <CopyIcon className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-48 flex flex-col gap-2">
        <span className="text-xs text-muted-foreground uppercase">Copy times to</span>
        {orderedWeekdays(firstDayOfWeek).map((day) => {
          const id = `availability-copy-${from}-${day}`
          return (
            <div key={day} className="flex items-center gap-2">
              <Checkbox
                id={id}
                disabled={day === from}
                checked={day === from || targets.includes(day)}
                onCheckedChange={(checked) => toggle(day, checked === true)}
              />
              <Label htmlFor={id} className="text-sm">
                {formatWeekday(weekdayDate(day), "long")}
              </Label>
            </div>
          )
        })}
        <Button
          disabled={targets.length === 0}
          onClick={() => {
            onCopy(targets)
            setOpen(false)
          }}
        >
          Apply
        </Button>
      </PopoverContent>
    </Popover>
  )
}
