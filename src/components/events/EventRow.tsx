import { format, isSameDay } from "date-fns"
import { FaRegCalendar as CalendarIcon } from "react-icons/fa6"

import { useCalendar } from "@/contexts/CalendarContext"
import { CalendarEvent } from "@/db/database"

export function EventRow({ event }: { event: CalendarEvent }) {
  const { calendars } = useCalendar()
  const calendar = calendars.find((c) => c.id === event.calendar_id)
  const calendarColor = calendar?.color

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
              ? `${format(from, "HH:mm")} - ${format(to, "HH:mm")}`
              : `${format(from, "MMM d, HH:mm")} - ${format(to, "MMM d, HH:mm")}`}
          </div>
          <div className="font-medium">{event.summary}</div>
        </div>
      </div>
    )
  }
}
