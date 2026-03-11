import type { Calendar, CalendarEvent } from "@/rpc/bindings"

export function isPendingEvent(event: CalendarEvent, calendars: Calendar[]): boolean {
  const calendar = calendars.find((c) => c.slug === event.calendar_slug)
  if (!calendar?.account) return false

  return event.attendees.some(
    (a) =>
      a.email.toLowerCase() === calendar.account!.toLowerCase() &&
      a.response_status === "needs-action",
  )
}
