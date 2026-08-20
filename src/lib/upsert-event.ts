import { eventKey, type CalendarEvent } from "@/lib/cal-events"

export function upsertEvent(events: CalendarEvent[], target: CalendarEvent): CalendarEvent[] {
  const targetKey = eventKey(target)
  return events.some((event) => eventKey(event) === targetKey) ? events : [...events, target]
}
