import type { MouseEvent } from "react"
import { memo, useMemo } from "react"

import { UntitledEventText } from "@/components/ui/untitled-event-text"

import { useCalEvents } from "@/contexts/CalEventsContext"
import { useCalendars } from "@/contexts/CalendarStateContext"
import { useSettings } from "@/contexts/SettingsContext"

import { CalendarEvent, eventKey } from "@/lib/cal-events"
import { getCalendarColor } from "@/lib/calendar-styles"
import { setEventAnchor } from "@/lib/event-anchor"
import { getCalendarEventStyle } from "@/lib/event-styles"
import {
  dateInViewerZone,
  formatMonth,
  formatShortDate,
  formatTime,
  isSameDay,
} from "@/lib/event-time"
import { getUserResponseStatus } from "@/lib/event-utils"

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
  const rsvp = getUserResponseStatus(event, calendars)
  const { activeEvent, toggleActiveEventKey } = useCalEvents()
  const highlighted = activeEvent ? eventKey(activeEvent) === eventKey(event) : false

  const formatRangeDate = (date: CalendarEvent["start"]): string => {
    const plainDate = dateInViewerZone(date)
    return `${formatMonth(plainDate, "short")} ${plainDate.day},`
  }

  const handleClick = (e: MouseEvent<HTMLDivElement>) => {
    e.stopPropagation()
    setEventAnchor(e.currentTarget)
    toggleActiveEventKey(eventKey(event))
  }

  return (
    <div
      data-slot="calendar-event"
      data-view="board"
      data-kind={event.start.kind === "date" ? "all-day" : "timed"}
      data-highlighted={highlighted || undefined}
      data-rsvp={rsvp ?? undefined}
      className="cursor-default py-1.5 border-b border-border last:border-b-0 outline-none"
      data-event-clickable
      style={getCalendarEventStyle({ calendarColor, eventColor: event.color })}
      onClick={handleClick}
    >
      <div className="flex gap-3 pl-3 pr-2">
        {/* Left accent bar — no rounding, matches event blocks in other views */}
        <div data-slot="calendar-event-color-marker" className="w-[3px] shrink-0 self-stretch" />
        <div className="min-w-0">
          {showDate && (
            <div
              data-slot="calendar-event-time"
              data-typography="numerical"
              className="text-xs text-muted-foreground h-4"
            >
              {formatShortDate(event.start)}
            </div>
          )}

          <div data-slot="calendar-event-title" className="text-sm font-medium truncate">
            {event.summary || <UntitledEventText />}
          </div>

          {event.start.kind !== "date" && (
            <div
              data-slot="calendar-event-time"
              data-typography="numerical"
              className="text-muted-foreground text-xs h-4"
            >
              {isSameDay(event.start, event.end)
                ? `${formatTime(event.start, timeFormat)} - ${formatTime(event.end, timeFormat)}`
                : `${formatRangeDate(event.start)} ${formatTime(event.start, timeFormat)} - ${formatRangeDate(event.end)} ${formatTime(event.end, timeFormat)}`}
            </div>
          )}

          {event.start.kind === "date" && (
            <div data-slot="calendar-event-time" className="text-xs text-muted-foreground h-4">
              All day
            </div>
          )}

          {event.location && (
            <div className="text-xs text-muted-foreground truncate">{event.location}</div>
          )}
        </div>
      </div>
    </div>
  )
})
