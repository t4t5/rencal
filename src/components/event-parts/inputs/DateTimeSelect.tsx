import { DatePicker } from "@/components/ui/date-picker"
import { Input } from "@/components/ui/input"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"

import {
  dateInEventZone,
  displayEndDate,
  isAllDay,
  localDateToPlainDate,
  plainDateToLocalDate,
  shouldShowDisplayEndDate,
  wallclockTime,
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

export type DateTimeRange = EventTimeRange

/** "HH:mm" — wallclock in the event's own zone. Empty for all-day. */
function formatHHMM(et: EventTime): string {
  if (isAllDay(et)) return ""
  const { hour, minute } = wallclockTime(et)
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`
}

export const DateTimeSelect = ({
  start,
  end,
  showTime = true,
  readOnly,
  onChange,
  onClose,
}: {
  start: EventTime
  end: EventTime
  showTime?: boolean
  readOnly?: boolean
  onChange: (range: DateTimeRange) => void
  onClose?: () => void
}) => {
  const allDay = isAllDay(start)

  const handleStartTime = (time: string) => {
    if (!time) return
    const [h, m] = time.split(":").map(Number)
    onChange(withRangeStartWallclockTime({ start, end }, h, m))
  }

  const handleEndTime = (time: string) => {
    if (!time) return
    const [h, m] = time.split(":").map(Number)
    onChange(withRangeEndWallclockTime({ start, end }, h, m))
  }

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
