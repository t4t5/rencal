import { format, isSameDay } from "date-fns"

import { Event } from "@/rpc/bindings"

import { useCalendar } from "@/contexts/CalendarContext"

export function EventRow({ event }: { event: Event }) {
  const { calendars } = useCalendar()
  const calendar = calendars.find((c) => c.id === event.calendar_id)
  const calendarColor = calendar?.color

  const from = new Date(event.start)
  const to = new Date(event.end)

  return (
    <div className="flex gap-3 pl-4 pr-2">
      <div
        className="w-1 bg-primary rounded"
        style={{
          ...(calendarColor ? { backgroundColor: calendarColor } : {}),
        }}
      />
      <div className="relative text-sm">
        <div className="text-muted-foreground">
          {event.all_day
            ? "All day"
            : isSameDay(from, to)
              ? `${format(from, "HH:mm")} - ${format(to, "HH:mm")}`
              : `${format(from, "MMM d, HH:mm")} - ${format(to, "MMM d, HH:mm")}`}
        </div>
        <div className="font-medium">{event.summary}</div>
      </div>
    </div>
  )
}
