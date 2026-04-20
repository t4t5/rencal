import { format, isSameDay } from "date-fns"
import { memo } from "react"

import { UntitledEventText } from "@/components/ui/untitled-event-text"

import { CalendarEvent } from "@/rpc/bindings"

import { useSettings } from "@/contexts/SettingsContext"

import { formatTime } from "@/lib/time"

import { CalendarFillIcon } from "@/icons/calendar-fill"

type EventRowProps = {
  event: CalendarEvent
  calendarColor: string | null
}

export const EventRow = memo(function EventRow({ event, calendarColor }: EventRowProps) {
  const { timeFormat } = useSettings()
  const from = event.start
  const to = event.end

  if (event.all_day) {
    return (
      <div className="flex gap-2 pl-3 pr-2 items-start">
        <div
          className="size-4 bg-primary rounded-circle flex items-center justify-center shrink-0 mt-0.5"
          style={{
            ...(calendarColor ? { backgroundColor: calendarColor } : {}),
          }}
        >
          <CalendarFillIcon className="text-black w-3" />
        </div>
        <div className="relative text-sm">
          <span className="font-medium">{event.summary || <UntitledEventText />}</span>
          <span className="w-2 inline-block" />
          <span className="text-muted-foreground whitespace-nowrap">all-day</span>
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
          <div className="text-muted-foreground font-numerical text-xs h-4">
            {isSameDay(from, to)
              ? `${formatTime(from, timeFormat)} - ${formatTime(to, timeFormat)}`
              : `${format(from, "MMM d,")} ${formatTime(from, timeFormat)} - ${format(to, "MMM d,")} ${formatTime(to, timeFormat)}`}
          </div>
          <div className="font-medium">{event.summary || <UntitledEventText />}</div>
        </div>
      </div>
    )
  }
})
