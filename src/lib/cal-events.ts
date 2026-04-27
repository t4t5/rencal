/*
 * App-side calendar event types. Same shape as the wire types in bindings.ts,
 * but with WireEventTime parsed into EventDateTime so app code holds Temporal
 * objects rather than strings. Conversion happens once at the RPC boundary.
 */
import type {
  CalendarEvent as WireCalendarEvent,
  Recurrence as WireRecurrence,
} from "@/rpc/bindings"

import { fromWire, toWire, type EventDateTime } from "./event-time"

export interface Recurrence {
  rrule: string
  exdates: EventDateTime[]
}

export interface CalendarEvent
  extends Omit<WireCalendarEvent, "start" | "end" | "recurrence" | "master_recurrence"> {
  start: EventDateTime
  end: EventDateTime
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
  return {
    ...w,
    start: fromWire(w.start),
    end: fromWire(w.end),
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
