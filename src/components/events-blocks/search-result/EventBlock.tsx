import type { TimeFormat } from "@/rpc/bindings"

import type { CalendarEvent } from "@/lib/cal-events"
import { formatShortDate, formatTime, isAllDay } from "@/lib/event-time"

export function SearchResultEventBlock({
  event,
  color,
  timeFormat,
}: {
  event: CalendarEvent
  color: string | null
  timeFormat: TimeFormat
}) {
  return (
    <>
      <div
        className="w-[3px] self-stretch shrink-0"
        style={{ backgroundColor: color ?? "var(--primary)" }}
      />
      <div className="min-w-0">
        <div className="font-medium text-sm truncate">{event.summary}</div>
        <div className="text-xs text-muted-foreground">
          {isAllDay(event.start)
            ? formatShortDate(event.start)
            : `${formatShortDate(event.start)} · ${formatTime(event.start, timeFormat)}`}
        </div>
      </div>
    </>
  )
}
