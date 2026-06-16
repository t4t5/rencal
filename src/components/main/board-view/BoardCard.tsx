import { format } from "date-fns"
import type { MouseEvent } from "react"
import { memo, useMemo } from "react"

import { UntitledEventText } from "@/components/ui/untitled-event-text"

import { useCalEvents } from "@/contexts/CalEventsContext"
import { useCalendars } from "@/contexts/CalendarStateContext"
import { useSettings } from "@/contexts/SettingsContext"

import { CalendarEvent, eventKey } from "@/lib/cal-events"
import { getCalendarColor } from "@/lib/calendar-styles"
import { setEventAnchor } from "@/lib/event-anchor"
import { getEventBlockColors } from "@/lib/event-styles"
import { formatShortDate, formatTime, isSameDay, toInteropDate } from "@/lib/event-time"

export const BoardCard = memo(function BoardCard({
  event,
  showDate,
}: {
  event: CalendarEvent
  showDate?: boolean
}) {
  const { timeFormat } = useSettings()
  const { calendars } = useCalendars()
  const calendarBySlug = useMemo(() => new Map(calendars.map((c) => [c.slug, c])), [calendars])
  const calendarColor = getCalendarColor(calendarBySlug.get(event.calendar_slug))
  const colors = getEventBlockColors({ calendarColor, eventColor: event.color })
  const { toggleActiveEventKey } = useCalEvents()

  const handleClick = (e: MouseEvent<HTMLDivElement>) => {
    e.stopPropagation()
    setEventAnchor(e.currentTarget)
    toggleActiveEventKey(eventKey(event))
  }

  return (
    <div
      className="cursor-default hover:bg-secondary py-1.5 border-b border-divider last:border-b-0 outline-none"
      data-event-clickable
      onClick={handleClick}
    >
      <div className="flex gap-3 pl-3 pr-2">
        {/* Left accent bar — no rounding, matches event blocks in other views */}
        <div
          className="w-[3px] shrink-0 self-stretch"
          style={{ backgroundColor: colors.borderColor }}
        />
        <div className="min-w-0">
          {showDate && (
            <div className="text-xs text-muted-foreground numerical h-4">
              {formatShortDate(event.start)}
            </div>
          )}

          <div className="text-sm font-medium truncate">
            {event.summary || <UntitledEventText />}
          </div>

          {event.start.kind !== "date" && (
            <div className="text-muted-foreground numerical text-xs h-4">
              {isSameDay(event.start, event.end)
                ? `${formatTime(event.start, timeFormat)} - ${formatTime(event.end, timeFormat)}`
                : `${format(toInteropDate(event.start), "MMM d,")} ${formatTime(event.start, timeFormat)} - ${format(toInteropDate(event.end), "MMM d,")} ${formatTime(event.end, timeFormat)}`}
            </div>
          )}

          {event.start.kind === "date" && (
            <div className="text-xs text-muted-foreground h-4">All day</div>
          )}

          {event.location && (
            <div className="text-xs text-muted-foreground truncate">{event.location}</div>
          )}
        </div>
      </div>
    </div>
  )
})
