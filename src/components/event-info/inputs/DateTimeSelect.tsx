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
  showTime = true,
  readOnly,
  onChangeStartDate,
  onChangeStartTime,
  onChangeEndDate,
  onChangeEndTime,
}: {
  start: Date
  end: Date
  allDay: boolean
  showTime?: boolean
  readOnly?: boolean
  onChangeStartDate: (start: Date | null) => void
  onChangeStartTime: (time: string) => void
  onChangeEndDate: (start: Date | null) => void
  onChangeEndTime: (time: string) => void
}) => {
  return (
    <div className="flex flex-col gap-1">
      {showTime && (
        <TimeSelect
          start={start}
          end={end}
          allDay={allDay}
          readOnly={readOnly}
          onChangeStartTime={onChangeStartTime}
          onChangeEndTime={onChangeEndTime}
        />
      )}
      <DateSelect
        start={start}
        end={end}
        allDay={allDay}
        readOnly={readOnly}
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
  readOnly,
  onChangeStartTime,
  onChangeEndTime,
}: {
  start: Date
  end: Date
  allDay: boolean
  readOnly?: boolean
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
          readOnly={readOnly}
          disabled={allDay}
          className={cn(readOnly && "hover:border-transparent! focus:bg-transparent!")}
        />
      </InputGroup>

      <ArrowIcon className="size-5 shrink-0 text-muted-foreground" />

      <Input
        type="time"
        placeholder="10:30"
        className={cn("w-36", readOnly && "hover:border-transparent! focus:bg-transparent!")}
        value={formattedEndTime}
        onChange={(e) => onChangeEndTime(e.target.value)}
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
  return (
    <div className="flex pl-[26px] flex-wrap">
      <DatePicker date={start} setDate={onChangeStart} className="w-30" readOnly={readOnly} />

      {allDay && (
        <>
          <div className="size-6 shrink-0" />

          <DatePicker
            date={end}
            setDate={(date) => {
              if (date && date < start) {
                onChangeEnd(start)
              } else {
                onChangeEnd(date)
              }
            }}
            className="w-30"
            readOnly={readOnly}
          />
        </>
      )}
    </div>
  )
}
