import { addMonths, endOfMonth, startOfMonth, subMonths } from "date-fns"

import { rpc } from "@/rpc"

import { DateRange } from "@/lib/types"

export const MONTHS_TO_LOAD = 2

export const getStartRangeForDate = (date: Date): DateRange => {
  return {
    start: startOfMonth(subMonths(date, MONTHS_TO_LOAD)),
    end: endOfMonth(addMonths(date, MONTHS_TO_LOAD)),
  }
}

export async function getCalendarEventsForRange(calendarSlugs: string[], start: Date, end: Date) {
  return rpc.caldir.list_events(calendarSlugs, start.toISOString(), end.toISOString())
}
