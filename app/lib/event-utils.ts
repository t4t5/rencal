import type { Calendar } from "@/lib/api"
import type { CalendarEvent, ResponseStatus } from "@/lib/cal-events"
import { coversFullDay, isAllDay } from "@/lib/event-time"

/**
 * Whether the event is drawn as a bar across days: all-day events, and timed
 * events covering at least one whole day. Shorter timed events crossing midnight,
 * like 23:00 to 01:00, stay at their times.
 */
export function isSpanning(event: CalendarEvent): boolean {
  if (isAllDay(event.start)) return true
  const { dateInfo } = event
  if (dateInfo.lastDay <= dateInfo.firstDay) return false
  // A whole day it covers, if any, is its first or second.
  return (
    coversFullDay(event.start, dateInfo, dateInfo.firstDay) ||
    coversFullDay(event.start, dateInfo, dateInfo.firstDay + 1)
  )
}

export function getUserResponseStatus(
  event: CalendarEvent,
  calendars: Calendar[],
): ResponseStatus | null {
  const calendar = calendars.find((c) => c.slug === event.calendar_slug)
  const email = calendar?.email?.toLowerCase()
  if (!email) return null

  const attendee = event.attendees.find((a) => a.email.toLowerCase() === email)
  return attendee?.response_status ?? null
}

export function isUserOrganizer(event: CalendarEvent, calendars: Calendar[]): boolean {
  if (!event.organizer) return true
  if (event.attendees.length === 0) return true
  const calendar = calendars.find((c) => c.slug === event.calendar_slug)
  const email = calendar?.email?.toLowerCase()
  if (!email) return true
  return event.organizer.email.toLowerCase() === email
}

export function isEventReadonly(event: CalendarEvent, calendars: Calendar[]): boolean {
  const calendar = calendars.find((c) => c.slug === event.calendar_slug)
  if (calendar?.read_only) return true
  return !isUserOrganizer(event, calendars)
}
