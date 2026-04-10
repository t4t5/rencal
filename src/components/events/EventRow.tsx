import { format, isSameDay } from "date-fns"
import { memo } from "react"
import { FaRegCalendar as CalendarIcon } from "react-icons/fa6"

import { CalendarEvent } from "@/rpc/bindings"

import { useTimeFormat } from "@/hooks/useTimeFormat"
import { formatTime } from "@/lib/time"

type EventRowProps = {
  event: CalendarEvent
  calendarColor: string | null
}

export const EventRow = memo(function EventRow({ event, calendarColor }: EventRowProps) {
  const { timeFormat } = useTimeFormat()
  const from = event.start
  const to = event.end

  if (event.all_day) {
    return (
      <div className="flex gap-2 pl-3 pr-2 items-center">
        <div
          className="size-4 bg-primary rounded-full flex items-center justify-center"
          style={{
            ...(calendarColor ? { backgroundColor: calendarColor } : {}),
          }}
        >
          <CalendarIcon className="text-black w-2.5" />
        </div>
        <div className="relative text-sm flex gap-2 flex-wrap">
          <div className="font-medium">{event.summary}</div>
          <div className="text-muted-foreground">all-day</div>
        </div>
      </div>
    )
  } else {
    return (
      <div className="flex gap-3 pl-4.5 pr-2">
        <div
          className="w-1 bg-primary rounded"
          style={{
            ...(calendarColor ? { backgroundColor: calendarColor } : {}),
          }}
        />
        <div className="relative text-sm">
          <div className="text-muted-foreground">
            {isSameDay(from, to)
              ? `${formatTime(from, timeFormat)} - ${formatTime(to, timeFormat)}`
              : `${format(from, "MMM d,")} ${formatTime(from, timeFormat)} - ${format(to, "MMM d,")} ${formatTime(to, timeFormat)}`}
          </div>
          <div className="font-medium">{event.summary}</div>
        </div>
      </div>
    )
  }
})
