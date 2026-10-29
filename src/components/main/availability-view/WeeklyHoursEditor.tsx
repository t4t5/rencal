import { Temporal } from "@js-temporal/polyfill"
import type { ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Label } from "@/components/ui/label"
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

import { CloseIcon } from "@/icons/close"
import { MoreHorizIcon } from "@/icons/more-horiz"
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
                <div className="flex items-center gap-1">
                  <span className="h-control flex items-center grow text-sm text-muted-foreground">
                    Unavailable
                  </span>
                  <RowActions>
                    <AddButton onClick={() => dispatch({ type: "add", day })} />
                  </RowActions>
                </div>
              )}
              {ranges.map((range, index) => (
                <div key={index} className="flex items-center gap-1">
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
                  <RowActions>
                    {index === 0 ? (
                      <>
                        <AddButton onClick={() => dispatch({ type: "add", day })} />
                        <DayMenu
                          multiple={ranges.length > 1}
                          onClearDay={() => dispatch({ type: "toggle", day, on: false })}
                          onClearFirst={() => dispatch({ type: "remove", day, index: 0 })}
                        />
                      </>
                    ) : (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        title="Remove times"
                        onClick={() => dispatch({ type: "remove", day, index })}
                      >
                        <CloseIcon className="size-4" />
                      </Button>
                    )}
                  </RowActions>
                </div>
              ))}
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

// Fixed width so a later row's remove button lines up under the first row's add button.
function RowActions({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center ml-auto shrink-0 w-[calc(var(--spacing-control-sm)*2)]">
      {children}
    </div>
  )
}

function AddButton({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="ghost" size="icon-sm" title="Add times" onClick={onClick}>
      <PlusIcon className="size-4" />
    </Button>
  )
}

function DayMenu({
  multiple,
  onClearDay,
  onClearFirst,
}: {
  multiple: boolean
  onClearDay: () => void
  onClearFirst: () => void
}) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="More options">
          <MoreHorizIcon className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={onClearDay}>Clear day</DropdownMenuItem>
        {multiple && (
          <DropdownMenuItem onSelect={onClearFirst}>Clear first time range</DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
