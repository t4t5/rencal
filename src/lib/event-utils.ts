import type { Calendar, CalendarEvent, ResponseStatus } from "@/rpc/bindings"

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

export function isPendingEvent(event: CalendarEvent, calendars: Calendar[]): boolean {
  return getUserResponseStatus(event, calendars) === "needs-action"
}

export function isDeclinedEvent(event: CalendarEvent, calendars: Calendar[]): boolean {
  return getUserResponseStatus(event, calendars) === "declined"
}
