import { Temporal } from "@js-temporal/polyfill"

import { rpc } from "@/rpc"

import { eventKey, rpcToCalendarEvents, type CalendarEvent } from "@/lib/cal-events"
import { getViewerTzid } from "@/lib/event-time"
import { DateRange } from "@/lib/types"

export const MONTHS_TO_LOAD = 2

/**
 * Merge freshly-loaded events into an existing list, dropping any already present
 * (by `eventKey`) and adding the rest to the front or back. Returns the same array
 * reference when nothing new came in, so callers can skip no-op state updates.
 */
export function mergeEvents(
  prev: CalendarEvent[],
  incoming: CalendarEvent[],
  position: "append" | "prepend",
): CalendarEvent[] {
  const existingKeys = new Set(prev.map(eventKey))
  const filtered = incoming.filter((e) => !existingKeys.has(eventKey(e)))
  if (!filtered.length) return prev
  return position === "append" ? [...prev, ...filtered] : [...filtered, ...prev]
}

export const getStartRangeForDate = (date: Temporal.PlainDate): DateRange => {
  const monthStart = date.with({ day: 1 })
  return {
    start: monthStart.subtract({ months: MONTHS_TO_LOAD }),
    end: monthStart.add({ months: MONTHS_TO_LOAD + 1 }),
  }
}

/** Convert a viewer-zone day boundary to the UTC instant expected by the RPC. */
function plainDateToUtcInstant(date: Temporal.PlainDate): string {
  return date.toZonedDateTime(getViewerTzid()).toInstant().toString()
}

export async function getCalendarEventsForRange(
  calendarSlugs: string[],
  start: Temporal.PlainDate,
  end: Temporal.PlainDate,
): Promise<CalendarEvent[]> {
  const events = await rpc.caldir.list_events(
    calendarSlugs,
    plainDateToUtcInstant(start),
    plainDateToUtcInstant(end),
  )
  return rpcToCalendarEvents(events)
}
