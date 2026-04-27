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
import type { CalendarEvent as RpcCalendarEvent, Recurrence as RpcRecurrence } from "@/rpc/bindings"

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
