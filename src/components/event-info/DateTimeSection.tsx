import { format } from "date-fns"
import { GoClock as ClockIcon } from "react-icons/go"
import { IoIosArrowRoundForward as ArrowIcon } from "react-icons/io"

import { Input } from "@/components/ui/input"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"

import { cn } from "@/lib/utils"

export const DateTimeSection = ({
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
  return (
    <div className="flex flex-col gap-1">
      <TimeSelector
        start={start}
        end={end}
        allDay={allDay}
        onChangeStartTime={onChangeStartTime}
        onChangeEndTime={onChangeEndTime}
      />
      <DateSelector start={start} end={end} allDay={allDay} />
    </div>
  )
}

const TimeSelector = ({
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
      <InputGroup className="w-32">
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
        className="w-32"
        value={formattedEndTime}
        onChange={(e) => onChangeEndTime(e.target.value)}
        disabled={allDay}
      />
    </div>
  )
}

const DateSelector = ({ start, end, allDay }: { start: Date; end: Date; allDay: boolean }) => {
  const formattedStartDate = format(start, "EEE d MMM")
  const formattedEndDate = format(end, "EEE d MMM")

  return (
    <div className="flex pl-6">
      <Input
        placeholder={formattedStartDate}
        value={formattedStartDate}
        readOnly
        className="w-26"
      />

      {allDay && (
        <>
          <div className="size-5 shrink-0" />
          <Input
            placeholder={formattedEndDate}
            value={formattedEndDate}
            readOnly
            className="w-26"
          />
        </>
      )}
    </div>
  )
}
