import type { CalendarEvent, ResponseStatus } from "@/lib/cal-events"
import { getCalendarEventStyle } from "@/lib/event-styles"
import type { TimeFormat } from "@/lib/event-time"
import { formatShortDate, formatTime, isAllDay } from "@/lib/event-time"

export function SearchResultEventBlock({
  event,
  color,
  timeFormat,
  rsvp,
}: {
  event: CalendarEvent
  color: string
  timeFormat: TimeFormat
  rsvp: ResponseStatus | null
}) {
  return (
    <div
      data-slot="calendar-event"
      data-view="search"
      data-kind={isAllDay(event.start) ? "all-day" : "timed"}
      data-rsvp={rsvp ?? undefined}
      className="flex min-w-0 items-center gap-2"
      style={getCalendarEventStyle({ calendarColor: color, eventColor: event.color })}
    >
      <div data-slot="calendar-event-color-marker" className="w-[3px] self-stretch shrink-0" />
      <div className="min-w-0">
        <div data-slot="calendar-event-title" className="truncate text-sm font-medium">
          {event.summary}
        </div>
        <div data-slot="calendar-event-time" className="text-xs text-muted-foreground">
          {isAllDay(event.start)
            ? formatShortDate(event.start)
            : `${formatShortDate(event.start)} · ${formatTime(event.start, timeFormat)}`}
        </div>
      </div>
    </div>
  )
}
