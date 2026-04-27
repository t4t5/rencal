/*
 * App-side calendar event types. Same shape as the wire types in bindings.ts,
 * but with WireEventTime parsed into EventDateTime so app code holds Temporal
 * objects rather than strings. Conversion happens once at the RPC boundary.
 *
 * CalendarEvent also carries `dateInfo` — numeric projections of start/end
 * (epoch ms, local-day ms, wallclock minutes). These are computed once at
 * construction time so the week/month layout hot loops can sort, group by
 * day, and place events without round-tripping through Temporal on every
 * render.
 */
import type {
  CalendarEvent as WireCalendarEvent,
  Recurrence as WireRecurrence,
} from "@/rpc/bindings"

import {
  computeEventDateInfo,
  fromWire,
  toWire,
  type EventDateInfo,
  type EventDateTime,
} from "./event-time"

export interface Recurrence {
  rrule: string
  exdates: EventDateTime[]
}

export interface CalendarEvent
  extends Omit<WireCalendarEvent, "start" | "end" | "recurrence" | "master_recurrence"> {
  start: EventDateTime
  end: EventDateTime
  dateInfo: EventDateInfo
  recurrence: Recurrence | null
  master_recurrence: Recurrence | null
}

export function wireToRecurrence(w: WireRecurrence): Recurrence {
  return { rrule: w.rrule, exdates: w.exdates.map(fromWire) }
}

export function recurrenceToWire(r: Recurrence): WireRecurrence {
  return { rrule: r.rrule, exdates: r.exdates.map(toWire) }
}

export function wireToCalendarEvent(w: WireCalendarEvent): CalendarEvent {
  const start = fromWire(w.start)
  const end = fromWire(w.end)
  return {
    ...w,
    start,
    end,
    dateInfo: computeEventDateInfo(start, end),
    recurrence: w.recurrence ? wireToRecurrence(w.recurrence) : null,
    master_recurrence: w.master_recurrence ? wireToRecurrence(w.master_recurrence) : null,
  }
}

export function calendarEventToWire(e: CalendarEvent): WireCalendarEvent {
  return {
    ...e,
    start: toWire(e.start),
    end: toWire(e.end),
    recurrence: e.recurrence ? recurrenceToWire(e.recurrence) : null,
    master_recurrence: e.master_recurrence ? recurrenceToWire(e.master_recurrence) : null,
  }
}

/**
 * Return a copy of `event` with new start/end, recomputing the `dateInfo`
 * sidecar. Use this anywhere code mutates an event's date range so the cache
 * stays in sync.
 */
export function withDates(
  event: CalendarEvent,
  start: EventDateTime,
  end: EventDateTime,
): CalendarEvent {
  return { ...event, start, end, dateInfo: computeEventDateInfo(start, end) }
}
