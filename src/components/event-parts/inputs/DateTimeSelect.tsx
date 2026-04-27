import { Temporal } from "@js-temporal/polyfill"

import { DatePicker } from "@/components/ui/date-picker"
import { Input } from "@/components/ui/input"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"

import {
  addDays,
  addMinutes,
  getWallclockTime,
  isAllDay,
  toEventDate,
  toInstant,
  withCalendarDate,
  withWallclockTime,
  type EventDateTime,
} from "@/lib/event-time"
import { cn } from "@/lib/utils"

import { ArrowRightIcon } from "@/icons/arrow-right"
import { ClockIcon } from "@/icons/clock"

export type DateTimeRange = { start: EventDateTime; end: EventDateTime }

/** "HH:mm" — wallclock in the event's own zone. Empty for all-day. */
function formatHHMM(et: EventDateTime): string {
  if (isAllDay(et)) return ""
  const { hour, minute } = getWallclockTime(et)
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`
}

/** Bridge a PlainDate to a viewer-local JS Date for DatePicker. */
function plainDateToJsDate(pd: Temporal.PlainDate): Date {
  return new Date(pd.year, pd.month - 1, pd.day)
}

/** Bridge a viewer-local JS Date back to a PlainDate. */
function jsDateToPlainDate(d: Date): Temporal.PlainDate {
  return new Temporal.PlainDate(d.getFullYear(), d.getMonth() + 1, d.getDate())
}

export const DateTimeSelect = ({
  start,
  end,
  showTime = true,
  readOnly,
  onChange,
  onClose,
}: {
  start: EventDateTime
  end: EventDateTime
  showTime?: boolean
  readOnly?: boolean
  onChange: (range: DateTimeRange) => void
  onClose?: () => void
}) => {
  const allDay = isAllDay(start)

  const handleStartTime = (time: string) => {
    if (!time) return
    const [h, m] = time.split(":").map(Number)
    const newStart = withWallclockTime(start, h, m)
    // Preserve duration: shift end by the same minute delta.
    const deltaMin = Math.round(
      (toInstant(newStart).epochMilliseconds - toInstant(start).epochMilliseconds) / 60_000,
    )
    const newEnd = end.kind === "date" ? end : addMinutes(end, deltaMin)
    onChange({ start: newStart, end: newEnd })
  }

  const handleEndTime = (time: string) => {
    if (!time) return
    const [h, m] = time.split(":").map(Number)
    let newEnd = withWallclockTime(end, h, m)
    // If user picked a time that lands before start (same day), wrap to next day.
    if (!allDay && toInstant(newEnd).epochMilliseconds < toInstant(start).epochMilliseconds) {
      newEnd = addDays(newEnd, 1)
    }
    onChange({ start, end: newEnd })
  }

  const handleStartDate = (jsDate: Date | null) => {
    if (!jsDate) return
    const newPd = jsDateToPlainDate(jsDate)
    const oldPd = toEventDate(start)
    const dayDelta = newPd.since(oldPd, { largestUnit: "days" }).days
    const newStart = withCalendarDate(start, newPd)
    const newEnd = addDays(end, dayDelta)
    onChange({ start: newStart, end: newEnd })
  }

  const handleEndDate = (jsDate: Date | null) => {
    if (!jsDate) return
    const pickedPd = jsDateToPlainDate(jsDate)
    const startPd = toEventDate(start)

    if (allDay) {
      // Displayed end-date is the last included day; stored end is exclusive (+1).
      // Clamp so end-date can't precede start.
      const clamped = Temporal.PlainDate.compare(pickedPd, startPd) < 0 ? startPd : pickedPd
      const stored = clamped.add({ days: 1 })
      onChange({ start, end: { kind: "date", value: stored } })
      return
    }

    onChange({ start, end: withCalendarDate(end, pickedPd) })
  }

  return (
    <div className="flex flex-col gap-1">
      {showTime && (
        <TimeSelect
          startHHMM={formatHHMM(start)}
          endHHMM={formatHHMM(end)}
          allDay={allDay}
          readOnly={readOnly}
          onChangeStartTime={handleStartTime}
          onChangeEndTime={handleEndTime}
          onClose={onClose}
        />
      )}
      <DateSelect
        startDate={plainDateToJsDate(toEventDate(start))}
        endDate={plainDateToJsDate(toEventDate(allDay ? subtractOneDay(end) : end))}
        showEndDate={shouldShowEndDate(start, end, allDay)}
        readOnly={readOnly}
        onChangeStart={handleStartDate}
        onChangeEnd={handleEndDate}
      />
    </div>
  )
}

/** All-day end is exclusive on the wire; the user-facing end-date is one day earlier. */
function subtractOneDay(et: EventDateTime): EventDateTime {
  return addDays(et, -1)
}

/** Hide the end-date input when the event lives on a single day. */
function shouldShowEndDate(start: EventDateTime, end: EventDateTime, allDay: boolean): boolean {
  if (allDay) {
    const startPd = toEventDate(start)
    const lastIncludedPd = toEventDate(subtractOneDay(end))
    return !startPd.equals(lastIncludedPd)
  }
  return !toEventDate(start).equals(toEventDate(end))
}

const TimeSelect = ({
  startHHMM,
  endHHMM,
  allDay,
  readOnly,
  onChangeStartTime,
  onChangeEndTime,
  onClose,
}: {
  startHHMM: string
  endHHMM: string
  allDay: boolean
  readOnly?: boolean
  onChangeStartTime: (time: string) => void
  onChangeEndTime: (time: string) => void
  onClose?: () => void
}) => {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault()
      onClose?.()
    }
  }

  return (
    <div
      className={cn("flex items-center", {
        "opacity-50": allDay,
      })}
    >
      <InputGroup
        className={cn("w-36", readOnly && "hover:border-transparent! focus-within:bg-transparent!")}
      >
        <InputGroupAddon>
          <ClockIcon />
        </InputGroupAddon>
        <InputGroupInput
          type="time"
          placeholder="09:30"
          value={startHHMM}
          onChange={(e) => onChangeStartTime(e.target.value)}
          onKeyDown={handleKeyDown}
          readOnly={readOnly}
          disabled={allDay}
          className={cn(readOnly && "hover:border-transparent! focus:bg-transparent!")}
        />
      </InputGroup>

      <ArrowRightIcon className="size-4 shrink-0 text-muted-foreground" />

      <Input
        type="time"
        placeholder="10:30"
        className={cn("w-36", readOnly && "hover:border-transparent! focus:bg-transparent!")}
        value={endHHMM}
        onChange={(e) => onChangeEndTime(e.target.value)}
        onKeyDown={handleKeyDown}
        readOnly={readOnly}
        disabled={allDay}
      />
    </div>
  )
}

const DateSelect = ({
  startDate,
  endDate,
  showEndDate,
  readOnly,
  onChangeStart,
  onChangeEnd,
}: {
  startDate: Date
  endDate: Date
  showEndDate: boolean
  readOnly?: boolean
  onChangeStart: (date: Date | null) => void
  onChangeEnd: (date: Date | null) => void
}) => {
  return (
    <div className="flex pl-[26px] flex-wrap">
      <div className="w-[107px] shrink-0">
        <DatePicker date={startDate} setDate={onChangeStart} readOnly={readOnly} />
      </div>

      {showEndDate && <DatePicker date={endDate} setDate={onChangeEnd} readOnly={readOnly} />}
    </div>
  )
}
