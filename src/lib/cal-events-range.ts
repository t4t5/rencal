import { Temporal } from "@js-temporal/polyfill"
import { addMonths, endOfMonth, startOfMonth, subMonths } from "date-fns"

import { rpc } from "@/rpc"

import { rpcToCalendarEvent, type CalendarEvent } from "@/lib/cal-events"
import { DateRange } from "@/lib/types"

export const MONTHS_TO_LOAD = 2

export const getStartRangeForDate = (date: Date): DateRange => {
  return {
    start: startOfMonth(subMonths(date, MONTHS_TO_LOAD)),
    end: endOfMonth(addMonths(date, MONTHS_TO_LOAD)),
  }
}

/** Range bounds are genuine UTC instants — no zone identity needed. */
function dateToUtcInstant(d: Date): string {
  return Temporal.Instant.fromEpochMilliseconds(d.getTime()).toString()
}

export async function getCalendarEventsForRange(
  calendarSlugs: string[],
  start: Date,
  end: Date,
): Promise<CalendarEvent[]> {
  const events = await rpc.caldir.list_events(
    calendarSlugs,
    dateToUtcInstant(start),
    dateToUtcInstant(end),
  )
  return events.map(rpcToCalendarEvent)
}
