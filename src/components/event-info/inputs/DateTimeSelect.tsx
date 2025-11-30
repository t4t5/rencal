import { format } from "date-fns"
import { GoClock as ClockIcon } from "react-icons/go"
import { IoIosArrowRoundForward as ArrowIcon } from "react-icons/io"

import { DatePicker } from "@/components/ui/date-picker"
import { Input } from "@/components/ui/input"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"

import { cn } from "@/lib/utils"

export const DateTimeSelect = ({
  start,
  end,
  allDay,
  onChangeStartDate,
  onChangeStartTime,
  onChangeEndDate,
  onChangeEndTime,
}: {
  start: Date
  end: Date
  allDay: boolean
  onChangeStartDate: (start: Date | null) => void
  onChangeStartTime: (time: string) => void
  onChangeEndDate: (start: Date | null) => void
  onChangeEndTime: (time: string) => void
}) => {
  return (
    <div className="flex flex-col gap-1">
      <TimeSelect
        start={start}
        end={end}
        allDay={allDay}
        onChangeStartTime={onChangeStartTime}
        onChangeEndTime={onChangeEndTime}
      />
      <DateSelect
        start={start}
        end={end}
        allDay={allDay}
        onChangeStart={onChangeStartDate}
        onChangeEnd={onChangeEndDate}
      />
    </div>
  )
}

const TimeSelect = ({
  start,
  end,
  allDay,
  onChangeStartTime,
  onChangeEndTime,
}: {
  start: Date
  end: Date
  allDay: boolean
  onChangeStartTime: (time: string) => void
  onChangeEndTime: (time: string) => void
}) => {
  const formattedStartTime = format(start, "HH:mm")
  const formattedEndTime = format(end, "HH:mm")

  return (
    <div
      className={cn("flex items-center", {
        "opacity-50": allDay,
      })}
    >
      <InputGroup className="w-36">
        <InputGroupAddon>
          <ClockIcon />
        </InputGroupAddon>
        <InputGroupInput
          type="time"
          placeholder="09:30"
          value={formattedStartTime}
          onChange={(e) => onChangeStartTime(e.target.value)}
          disabled={allDay}
        />
      </InputGroup>

      <ArrowIcon className="size-5 shrink-0 text-muted-foreground" />

      <Input
        type="time"
        placeholder="10:30"
        className="w-36"
        value={formattedEndTime}
        onChange={(e) => onChangeEndTime(e.target.value)}
        disabled={allDay}
      />
    </div>
  )
}

const DateSelect = ({
  start,
  end,
  allDay,
  onChangeStart,
  onChangeEnd,
}: {
  start: Date
  end: Date
  allDay: boolean
  onChangeStart: (date: Date | null) => void
  onChangeEnd: (date: Date | null) => void
}) => {
  return (
    <div className="flex pl-6">
      <DatePicker date={start} setDate={onChangeStart} className="w-30" />

      {allDay && (
        <>
          <div className="size-6 shrink-0" />

          <DatePicker date={end} setDate={onChangeEnd} className="w-30" />
        </>
      )}
    </div>
  )
}
