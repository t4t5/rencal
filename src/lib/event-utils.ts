import type { Calendar, CalendarEvent, ResponseStatus } from "@/rpc/bindings"

function getUserResponseStatus(event: CalendarEvent, calendars: Calendar[]): ResponseStatus | null {
  const calendar = calendars.find((c) => c.slug === event.calendar_slug)
  if (!calendar?.account) return null

  const attendee = event.attendees.find(
    (a) => a.email.toLowerCase() === calendar.account!.toLowerCase(),
  )
  return attendee?.response_status ?? null
}

export function isPendingEvent(event: CalendarEvent, calendars: Calendar[]): boolean {
  return getUserResponseStatus(event, calendars) === "needs-action"
}

export function isDeclinedEvent(event: CalendarEvent, calendars: Calendar[]): boolean {
  return getUserResponseStatus(event, calendars) === "declined"
}
