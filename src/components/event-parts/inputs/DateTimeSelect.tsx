import { useRef } from "react"

import { DatePicker } from "@/components/ui/date-picker"
import { InputGroupAddon } from "@/components/ui/input-group"

import {
  dateInEventZone,
  displayEndDate,
  isAllDay,
  localDateToPlainDate,
  plainDateToLocalDate,
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
  showTime = true,
  readOnly,
  onChange,
}: {
  start: EventTime
  end: EventTime
  showTime?: boolean
  readOnly?: boolean
  onChange: (range: DateTimeRange) => void
}) => {
  const allDay = isAllDay(start)
  const lastTimedRange = useRef<DateTimeRange | null>(null)

  if (!allDay) {
    lastTimedRange.current = { start, end }
  }

  const visibleTimeRange = allDay ? (lastTimedRange.current ?? { start, end }) : { start, end }

  const handleStartTime = (hour: number, minute: number) =>
    onChange(withRangeStartWallclockTime({ start, end }, hour, minute))

  const handleEndTime = (hour: number, minute: number) =>
    onChange(withRangeEndWallclockTime({ start, end }, hour, minute))

  const handleStartDate = (jsDate: Date | null) => {
    if (!jsDate) return
    onChange(withRangeStartDate({ start, end }, localDateToPlainDate(jsDate)))
  }

  const handleEndDate = (jsDate: Date | null) => {
    if (!jsDate) return
    onChange(withRangeDisplayEndDate({ start, end }, localDateToPlainDate(jsDate)))
  }

  return (
    <div className="flex flex-col gap-1">
      {showTime && (
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
        startDate={plainDateToLocalDate(dateInEventZone(start))}
        endDate={plainDateToLocalDate(displayEndDate({ start, end }))}
        showEndDate={shouldShowDisplayEndDate({ start, end })}
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
    <div className="flex flex-wrap gap-1">
      <div
        className="shrink-0 flex"
        style={{
          width: FIRST_INPUT_WIDTH,
        }}
      >
        <InputGroupAddon />
        <DatePicker date={startDate} setDate={onChangeStart} readOnly={readOnly} />
      </div>

      {showEndDate && <DatePicker date={endDate} setDate={onChangeEnd} readOnly={readOnly} />}
    </div>
  )
}
