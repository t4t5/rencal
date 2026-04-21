import { addDays, format, parse, subDays } from "date-fns"

import { DatePicker } from "@/components/ui/date-picker"
import { Input } from "@/components/ui/input"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"

import { cn } from "@/lib/utils"

import { ArrowRightIcon } from "@/icons/arrow-right"
import { ClockIcon } from "@/icons/clock"

export type DateTimeRange = { start: Date; end: Date }

export const DateTimeSelect = ({
  start,
  end,
  allDay,
  showTime = true,
  readOnly,
  onChange,
  onClose,
}: {
  start: Date
  end: Date
  allDay: boolean
  showTime?: boolean
  readOnly?: boolean
  onChange: (range: DateTimeRange) => void
  onClose?: () => void
}) => {
  const shiftStart = (newStart: Date) => {
    const delta = newStart.getTime() - start.getTime()
    onChange({ start: newStart, end: new Date(end.getTime() + delta) })
  }

  const handleStartDate = (date: Date | null) => {
    if (!date) return
    const newStart = new Date(start)
    newStart.setFullYear(date.getFullYear(), date.getMonth(), date.getDate())
    shiftStart(newStart)
  }

  const handleStartTime = (time: string) => {
    shiftStart(parse(time, "HH:mm", start))
  }

  const handleEndDate = (date: Date | null) => {
    if (!date) return
    const clamped = allDay && date < start ? start : date
    const base = allDay ? addDays(clamped, 1) : clamped
    const newEnd = new Date(end)
    newEnd.setFullYear(base.getFullYear(), base.getMonth(), base.getDate())
    onChange({ start, end: newEnd })
  }

  const handleEndTime = (time: string) => {
    onChange({ start, end: parse(time, "HH:mm", start) })
  }

  return (
    <div className="flex flex-col gap-1">
      {showTime && (
        <TimeSelect
          start={start}
          end={end}
          allDay={allDay}
          readOnly={readOnly}
          onChangeStartTime={handleStartTime}
          onChangeEndTime={handleEndTime}
          onClose={onClose}
        />
      )}
      <DateSelect
        start={start}
        end={end}
        allDay={allDay}
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
  onClose,
}: {
  start: Date
  end: Date
  allDay: boolean
  readOnly?: boolean
  onChangeStartTime: (time: string) => void
  onChangeEndTime: (time: string) => void
  onClose?: () => void
}) => {
  const formattedStartTime = format(start, "HH:mm")
  const formattedEndTime = format(end, "HH:mm")

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
          value={formattedStartTime}
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
        value={formattedEndTime}
        onChange={(e) => onChangeEndTime(e.target.value)}
        onKeyDown={handleKeyDown}
        readOnly={readOnly}
        disabled={allDay}
      />
    </div>
  )
}

const DateSelect = ({
  start,
  end,
  allDay,
  readOnly,
  onChangeStart,
  onChangeEnd,
}: {
  start: Date
  end: Date
  allDay: boolean
  readOnly?: boolean
  onChangeStart: (date: Date | null) => void
  onChangeEnd: (date: Date | null) => void
}) => {
  const displayEnd = allDay ? subDays(end, 1) : end

  return (
    <div className="flex pl-[26px] flex-wrap">
      <div className="w-[107px] shrink-0">
        <DatePicker date={start} setDate={onChangeStart} readOnly={readOnly} />
      </div>

      {allDay && <DatePicker date={displayEnd} setDate={onChangeEnd} readOnly={readOnly} />}
    </div>
  )
}
