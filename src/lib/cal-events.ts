/*
 * App-side calendar event types. Same shape as the RPC types in bindings.ts,
 * but with RpcEventTime parsed into EventTime so app code holds Temporal
 * objects rather than strings. Conversion happens once at the RPC boundary.
 *
 * CalendarEvent also carries `dateInfo` — numeric projections of start/end
 * (epoch ms, epoch-day integers, wallclock minutes). These are computed once at
 * construction time so the week/month layout hot loops can sort, group by
 * day, and place events without round-tripping through Temporal on every
 * render.
 */
import type {
  EventAttendee,
  CalendarEvent as RpcCalendarEvent,
  ResponseStatus,
  RpcRecurrence,
} from "@/rpc/bindings"

import { rpcToConference, type EventConference } from "./conference"
import { computeEventDateInfo, type EventDateInfo, type EventTime } from "./event-time"
import { fromRpcEventTime, toRpcEventTime } from "./event-time/rpc"

// Identical on the wire and in the app; re-exported so UI code never reads bindings.
export type { EventAttendee, ResponseStatus }

export interface Recurrence {
  rrule: string
  exdates: EventTime[]
  rdates: EventTime[]
}

export interface CalendarEvent
  extends Omit<
    RpcCalendarEvent,
    "start" | "end" | "recurrence" | "master_recurrence" | "conference"
  > {
  start: EventTime
  end: EventTime
  dateInfo: EventDateInfo
  recurrence: Recurrence | null
  master_recurrence: Recurrence | null
  conference: EventConference | null
}

/**
 * Stable, app-wide identity for an event. An event's `id`
 * (`{uid}__{recurrence_id}` from the backend) is only unique *within* one
 * calendar — the same series subscribed via two calendars (e.g. an Outlook
 * account plus a WebCal mirror of it) yields two events with the same `id`.
 * Namespacing by `calendar_slug` keeps identity unique everywhere it's used as a
 * key: React list keys, infinite-scroll dedup, and the active-event tracker.
 */
export function eventKey(event: Pick<CalendarEvent, "id" | "calendar_slug">): string {
  return `${event.calendar_slug}::${event.id}`
}

/**
 * Replace an optimistic create with the event returned by the backend.
 *
 * A reload may remove the optimistic row while create_event is in flight. In
 * that case, append the created event so it is not missing until the next
 * reload. If the reload already fetched the created event, only remove the
 * stale optimistic row instead of introducing a duplicate.
 */
export function reconcileOptimisticCreate(
  events: CalendarEvent[],
  optimisticEvent: Pick<CalendarEvent, "id" | "calendar_slug">,
  createdEvent: CalendarEvent,
): CalendarEvent[] {
  const optimisticKey = eventKey(optimisticEvent)
  const createdKey = eventKey(createdEvent)
  const optimisticIndex = events.findIndex((event) => eventKey(event) === optimisticKey)
  const createdIndex = events.findIndex((event) => eventKey(event) === createdKey)

  if (createdIndex !== -1) {
    if (optimisticIndex === -1 || optimisticIndex === createdIndex) return events
    return events.filter((_, index) => index !== optimisticIndex)
  }

  if (optimisticIndex === -1) return [...events, createdEvent]
  return events.map((event, index) => (index === optimisticIndex ? createdEvent : event))
}

/** Remove an optimistic create after create_event fails. */
export function rollbackOptimisticCreate(
  events: CalendarEvent[],
  optimisticEvent: Pick<CalendarEvent, "id" | "calendar_slug">,
): CalendarEvent[] {
  const optimisticKey = eventKey(optimisticEvent)
  const optimisticIndex = events.findIndex((event) => eventKey(event) === optimisticKey)
  if (optimisticIndex === -1) return events
  return events.filter((_, index) => index !== optimisticIndex)
}

export function rpcToRecurrence(w: RpcRecurrence): Recurrence {
  return {
    rrule: w.rrule,
    exdates: w.exdates.map(fromRpcEventTime),
    rdates: w.rdates.map(fromRpcEventTime),
  }
}

export function recurrenceToRpc(r: Recurrence): RpcRecurrence {
  return {
    rrule: r.rrule,
    exdates: r.exdates.map(toRpcEventTime),
    rdates: r.rdates.map(toRpcEventTime),
  }
}

export function rpcToCalendarEvent(w: RpcCalendarEvent): CalendarEvent {
  const start = fromRpcEventTime(w.start)
  const end = fromRpcEventTime(w.end)
  return {
    ...w,
    start,
    end,
    dateInfo: computeEventDateInfo(start, end),
    recurrence: w.recurrence ? rpcToRecurrence(w.recurrence) : null,
    master_recurrence: w.master_recurrence ? rpcToRecurrence(w.master_recurrence) : null,
    conference: rpcToConference(w.conference),
  }
}

/**
 * Convert a batch of RPC events, skipping any that fail to parse (e.g. a
 * non-IANA TZID like "GMT+0100" from an external sync) instead of rejecting
 * the whole load.
 */
export function rpcToCalendarEvents(rpcEvents: RpcCalendarEvent[]): CalendarEvent[] {
  const converted: CalendarEvent[] = []
  for (const rpcEvent of rpcEvents) {
    try {
      converted.push(rpcToCalendarEvent(rpcEvent))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.warn(`Skipping event "${rpcEvent.summary}" (${eventKey(rpcEvent)}): ${message}`)
    }
  }
  return converted
}

/**
 * Return a copy of `event` with new start/end, recomputing the `dateInfo`
 * sidecar. Use this anywhere code mutates an event's date range so the cache
 * stays in sync.
 */
export function withDates(event: CalendarEvent, start: EventTime, end: EventTime): CalendarEvent {
  return { ...event, start, end, dateInfo: computeEventDateInfo(start, end) }
}
