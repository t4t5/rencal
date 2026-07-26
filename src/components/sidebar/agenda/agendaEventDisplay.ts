import { Temporal } from "@js-temporal/polyfill"

import type { CalendarEvent } from "@/lib/cal-events"
import {
  enumerateLocalDateKeys,
  formatDateKey,
  getLocalTzid,
  instantForOrdering,
  isAllDay,
} from "@/lib/event-time"

export type AgendaEventDisplay = "all-day" | "time-range" | "starts-at" | "ends-at"

export function getAgendaEventDisplay(
  event: Pick<CalendarEvent, "start" | "end">,
  dateKey: string,
): AgendaEventDisplay {
  // All-day event:
  if (isAllDay(event.start)) return "all-day"

  const occupiedDateKeys = Array.from(enumerateLocalDateKeys(event.start, event.end))

  // Same day, different times:
  if (formatDateKey(event.start) === formatDateKey(event.end)) return "time-range"

  const date = Temporal.PlainDate.from(dateKey)
  const timezone = getLocalTzid()

  const dayStartMs = date.toZonedDateTime(timezone).epochMilliseconds
  const dayEndMs = date.add({ days: 1 }).toZonedDateTime(timezone).epochMilliseconds

  const eventStartMs = instantForOrdering(event.start).epochMilliseconds
  const eventEndMs = instantForOrdering(event.end).epochMilliseconds

  // Different dates, but the event fully occupies the day:
  if (eventStartMs <= dayStartMs && eventEndMs >= dayEndMs) return "all-day"

  // Different dates, but the event starts on this day:
  if (dateKey === occupiedDateKeys[0]) return "starts-at"

  // Different dates, but the event ends on this day:
  if (dateKey === occupiedDateKeys.at(-1)) return "ends-at"

  return "all-day"
}
