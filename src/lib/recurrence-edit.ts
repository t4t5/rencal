import { type CalendarEvent, eventKey } from "@/lib/cal-events"
import { dateInEventZone, withRangeStartDate } from "@/lib/event-time"
import type { EventTime, EventTimeRange } from "@/lib/event-time"

/** An edit to a recurring occurrence, waiting for (or saving after) the scope dialog. */
export type PendingEdit = { current: CalendarEvent; original: CalendarEvent }

/**
 * Move an edited recurring occurrence back to the master's anchor date.
 * The occurrence supplies the range shape, including whether it is all-day.
 */
export function anchorRangeToRecurringMaster(
  current: EventTimeRange,
  masterStart: EventTime,
): EventTimeRange {
  return withRangeStartDate(current, dateInEventZone(masterStart))
}

/**
 * `events` with each edited occurrence drawn as its edited copy, so a change
 * stays visible while the user picks which events it applies to. Later edits
 * to the same occurrence win. Returns `events` itself when nothing matches.
 */
export function withPendingEdits(
  events: CalendarEvent[],
  edits: readonly PendingEdit[],
): CalendarEvent[] {
  if (edits.length === 0) return events
  const byKey = new Map(edits.map((edit) => [eventKey(edit.original), edit.current]))
  let replaced = false
  const shown = events.map((event) => {
    const edited = byKey.get(eventKey(event))
    if (!edited) return event
    replaced = true
    return edited
  })
  return replaced ? shown : events
}
