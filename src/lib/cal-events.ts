/*
 * App-side calendar event types. Same shape as the RPC types in bindings.ts,
 * but with RpcEventTime parsed into EventTime so app code holds Temporal
 * objects rather than strings. Conversion happens once at the RPC boundary.
 *
 * CalendarEvent also carries `dateInfo` — numeric projections of start/end
 * (epoch ms, local-day ms, wallclock minutes). These are computed once at
 * construction time so the week/month layout hot loops can sort, group by
 * day, and place events without round-tripping through Temporal on every
 * render.
 */
import type { CalendarEvent as RpcCalendarEvent, RpcRecurrence } from "@/rpc/bindings"

import { computeEventDateInfo, type EventDateInfo, type EventTime } from "./event-time"
import { fromRpcEventTime, toRpcEventTime } from "./event-time/rpc"

export interface Recurrence {
  rrule: string
  exdates: EventTime[]
}

export interface CalendarEvent
  extends Omit<RpcCalendarEvent, "start" | "end" | "recurrence" | "master_recurrence"> {
  start: EventTime
  end: EventTime
  dateInfo: EventDateInfo
  recurrence: Recurrence | null
  master_recurrence: Recurrence | null
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

export function rpcToRecurrence(w: RpcRecurrence): Recurrence {
  return { rrule: w.rrule, exdates: w.exdates.map(fromRpcEventTime) }
}

export function recurrenceToRpc(r: Recurrence): RpcRecurrence {
  return { rrule: r.rrule, exdates: r.exdates.map(toRpcEventTime) }
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

export function calendarEventToRpc(e: CalendarEvent): RpcCalendarEvent {
  return {
    ...e,
    start: toRpcEventTime(e.start),
    end: toRpcEventTime(e.end),
    recurrence: e.recurrence ? recurrenceToRpc(e.recurrence) : null,
    master_recurrence: e.master_recurrence ? recurrenceToRpc(e.master_recurrence) : null,
  }
}

/**
 * Return a copy of `event` with new start/end, recomputing the `dateInfo`
 * sidecar. Use this anywhere code mutates an event's date range so the cache
 * stays in sync.
 */
export function withDates(event: CalendarEvent, start: EventTime, end: EventTime): CalendarEvent {
  return { ...event, start, end, dateInfo: computeEventDateInfo(start, end) }
}
