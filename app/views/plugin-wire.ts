/* renCal's state as a view plugin hears it (`sdk/protocol.ts`). */
import type { Calendar } from "@/lib/api"
import { eventKey, type CalendarEvent } from "@/lib/cal-events"
import { isDraftEvent } from "@/lib/draft-to-event"
import { isDragPreview } from "@/lib/event-drag"
import { eventPaint } from "@/lib/event-paint"
import { DAY_MINUTES, epochDay, type EventTime, plainDateFromEpochDay } from "@/lib/event-time"
import { getUserResponseStatus, isSpanning } from "@/lib/event-utils"
import type { DateRange } from "@/lib/types"

import type { WireCalendar, WireEvent, WireEventTime } from "@/sdk/protocol"
import { isSelected, paintOf } from "@/views/event-block"

const wireTime = (time: EventTime): WireEventTime => ({
  kind: time.kind,
  value: time.value.toString(),
})

export function toWireEvent(event: CalendarEvent, calendars: Calendar[]): WireEvent {
  const { firstDay, lastDay, endDay, startLocalMinutes, endLocalMinutes } = event.dateInfo
  return {
    key: eventKey(event),
    calendarId: event.calendar_slug,
    summary: event.summary,
    description: event.description,
    location: event.location,
    url: event.url,
    start: wireTime(event.start),
    end: wireTime(event.end),
    firstDay: plainDateFromEpochDay(firstDay).toString(),
    lastDay: plainDateFromEpochDay(Math.max(firstDay, lastDay)).toString(),
    startMinutes: startLocalMinutes,
    endMinutes: (endDay - firstDay) * DAY_MINUTES + endLocalMinutes,
    status: event.status,
    availability: event.availability,
    rsvp: getUserResponseStatus(event, calendars),
    transient: isDraftEvent(event) ? "draft" : isDragPreview(event) ? "drag-preview" : null,
    selected: isSelected(event),
    spanning: isSpanning(event),
    paint: paintOf(event),
  }
}

/** The events overlapping `range`, in start order. */
export function eventsInRange(
  events: readonly CalendarEvent[],
  range: DateRange,
  calendars: Calendar[],
): WireEvent[] {
  const first = epochDay(range.start)
  const last = epochDay(range.end)
  return events
    .filter((event) => event.dateInfo.lastDay >= first && event.dateInfo.firstDay < last)
    .toSorted((a, b) => a.dateInfo.startMs - b.dateInfo.startMs)
    .map((event) => toWireEvent(event, calendars))
}

export const toWireCalendar = (calendar: Calendar, visible: boolean): WireCalendar => ({
  id: calendar.slug,
  name: calendar.name || calendar.slug,
  color: eventPaint(calendar.color ?? null).color,
  visible,
})
