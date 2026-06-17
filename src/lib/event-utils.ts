import type { Calendar, ResponseStatus } from "@/rpc/bindings"

import type { CalendarEvent } from "@/lib/cal-events"
import { isAllDay } from "@/lib/event-time"
import { MS_PER_DAY } from "@/lib/time"

/**
 * All-day events always occupy the all-day lane; timed events only span it if
 * they cross a day boundary.
 */
export function isSpanning(event: CalendarEvent): boolean {
  return isAllDay(event.start) || event.dateInfo.lastDayMs - event.dateInfo.firstDayMs >= MS_PER_DAY
}

export function getUserResponseStatus(
  event: CalendarEvent,
  calendars: Calendar[],
): ResponseStatus | null {
  const calendar = calendars.find((c) => c.slug === event.calendar_slug)
  if (!calendar?.account) return null

  const attendee = event.attendees.find(
    (a) => a.email.toLowerCase() === calendar.account!.toLowerCase(),
  )
  return attendee?.response_status ?? null
}

export function isUserOrganizer(event: CalendarEvent, calendars: Calendar[]): boolean {
  if (!event.organizer) return true
  if (event.attendees.length === 0) return true
  const calendar = calendars.find((c) => c.slug === event.calendar_slug)
  if (!calendar?.account) return true
  return event.organizer.email.toLowerCase() === calendar.account.toLowerCase()
}

export function isEventReadonly(event: CalendarEvent, calendars: Calendar[]): boolean {
  const calendar = calendars.find((c) => c.slug === event.calendar_slug)
  if (calendar?.read_only) return true
  return !isUserOrganizer(event, calendars)
}

export function isPendingEvent(event: CalendarEvent, calendars: Calendar[]): boolean {
  return getUserResponseStatus(event, calendars) === "needs-action"
}

export function isDeclinedEvent(event: CalendarEvent, calendars: Calendar[]): boolean {
  return getUserResponseStatus(event, calendars) === "declined"
}
