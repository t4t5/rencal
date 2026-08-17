import { Temporal } from "@js-temporal/polyfill"

import { DatePicker } from "@/components/ui/date-picker"
import { InputGroupAddon } from "@/components/ui/input-group"

import { useLastTimedRange } from "@/hooks/useLastTimedRange"
import {
  dateInEventZone,
  displayEndDate,
  isAllDay,
  shouldShowDisplayEndDate,
  type EventTime,
  type EventTimeRange,
  withRangeDisplayEndDate,
  withRangeEndWallclockTime,
  withRangeStartDate,
  withRangeStartWallclockTime,
} from "@/lib/event-time"
import { cn } from "@/lib/utils"

import { ArrowRightIcon } from "@/icons/arrow-right"
import { ClockIcon } from "@/icons/clock"

import { TimeInput } from "./TimeInput"

export type DateTimeRange = EventTimeRange

// To make sure time + dates are aligned
const FIRST_INPUT_WIDTH = 140

export const DateTimeSelect = ({
  start,
  end,
  readOnly,
  onChange,
}: {
  start: EventTime
  end: EventTime
  readOnly?: boolean
  onChange: (range: DateTimeRange) => void
}) => {
  const allDay = isAllDay(start)
  const lastTimedRange = useLastTimedRange(start, end)
  // An all-day event with no remembered timed range has no times to show —
  // hide the time row entirely instead of rendering empty inputs.
  const visibleTimeRange = allDay ? lastTimedRange : { start, end }
  const timeRowVisible = visibleTimeRange !== null

  const handleStartTime = (hour: number, minute: number) =>
    onChange(withRangeStartWallclockTime({ start, end }, hour, minute))

  const handleEndTime = (hour: number, minute: number) =>
    onChange(withRangeEndWallclockTime({ start, end }, hour, minute))

  const handleStartDate = (date: Temporal.PlainDate | null) => {
    if (!date) return
    onChange(withRangeStartDate({ start, end }, date))
  }

  const handleEndDate = (date: Temporal.PlainDate | null) => {
    if (!date) return
    onChange(withRangeDisplayEndDate({ start, end }, date))
  }

  return (
    <div className="flex flex-col gap-1">
      {timeRowVisible && (
        <TimeSelect
          start={visibleTimeRange.start}
          end={visibleTimeRange.end}
          allDay={allDay}
          readOnly={readOnly}
          onChangeStartTime={handleStartTime}
          onChangeEndTime={handleEndTime}
        />
      )}
      <DateSelect
        startDate={dateInEventZone(start)}
        endDate={displayEndDate({ start, end })}
        showEndDate={shouldShowDisplayEndDate({ start, end })}
        icon={timeRowVisible ? null : <ClockIcon />}
        readOnly={readOnly}
        onChangeStart={handleStartDate}
        onChangeEnd={handleEndDate}
      />
    </div>
  )
}

const TimeSelect = ({
  start,
  end,
  allDay,
  readOnly,
  onChangeStartTime,
  onChangeEndTime,
}: {
  start: EventTime
  end: EventTime
  allDay: boolean
  readOnly?: boolean
  onChangeStartTime: (hour: number, minute: number) => void
  onChangeEndTime: (hour: number, minute: number) => void
}) => {
  return (
    <div
      className={cn("flex items-center", {
        "opacity-50": allDay,
      })}
    >
      <div className="flex items-center shrink-0" style={{ width: FIRST_INPUT_WIDTH }}>
        <TimeInput
          value={start}
          addon={
            <InputGroupAddon>
              <ClockIcon />
            </InputGroupAddon>
          }
          readOnly={readOnly}
          disabled={allDay}
          onChange={onChangeStartTime}
        />

        <ArrowRightIcon className="size-4 shrink-0 text-muted-foreground" />
      </div>

      <div className="w-[111px] shrink-0">
        <TimeInput value={end} readOnly={readOnly} disabled={allDay} onChange={onChangeEndTime} />
      </div>
    </div>
  )
}

const DateSelect = ({
  startDate,
  endDate,
  showEndDate,
  icon,
  readOnly,
  onChangeStart,
  onChangeEnd,
}: {
  startDate: Temporal.PlainDate
  endDate: Temporal.PlainDate
  showEndDate: boolean
  icon?: React.ReactNode
  readOnly?: boolean
  onChangeStart: (date: Temporal.PlainDate | null) => void
  onChangeEnd: (date: Temporal.PlainDate | null) => void
}) => {
  return (
    <div className="flex flex-wrap gap-1">
      <div
        className="shrink-0 flex"
        style={{
          width: FIRST_INPUT_WIDTH,
        }}
      >
        <InputGroupAddon>{icon}</InputGroupAddon>
        <DatePicker date={startDate} setDate={onChangeStart} readOnly={readOnly} />
      </div>

      {showEndDate && <DatePicker date={endDate} setDate={onChangeEnd} readOnly={readOnly} />}
    </div>
  )
}
