import { format } from "date-fns"
import { GoClock as ClockIcon } from "react-icons/go"
import { IoIosArrowRoundForward as ArrowIcon } from "react-icons/io"

import { Section, SectionIcon, SectionInput } from "@/components/event-info/Section"

import { cn } from "@/lib/utils"

export const TimeSection = ({
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

  const formattedStartDate = format(start, "EEE d MMM")
  const formattedEndDate = format(end, "EEE d MMM")

  return (
    <Section>
      <SectionIcon
        className={cn({
          "opacity-50": allDay,
        })}
      >
        <ClockIcon className="size-4" />
      </SectionIcon>

      <div className="flex flex-col gap-2">
        <div
          className={cn("flex", {
            "opacity-50": allDay,
          })}
        >
          <SectionInput
            type="time"
            placeholder="09:30"
            className="w-[85px]"
            value={formattedStartTime}
            onChange={(e) => onChangeStartTime(e.target.value)}
            disabled={allDay}
          />
          <ArrowIcon className="size-5 shrink-0" />
          <SectionInput
            type="time"
            placeholder="10:30"
            className="pl-4"
            value={formattedEndTime}
            onChange={(e) => onChangeEndTime(e.target.value)}
            disabled={allDay}
          />
        </div>

        <div className="flex">
          <SectionInput
            placeholder={formattedStartDate}
            className="w-[85px]"
            value={formattedStartDate}
            readOnly
          />
          {allDay && (
            <>
              <div className="size-5 shrink-0" />
              <SectionInput
                placeholder={formattedEndDate}
                className="pl-4"
                value={formattedEndDate}
                readOnly
              />
            </>
          )}
        </div>
      </div>
    </Section>
  )
}
