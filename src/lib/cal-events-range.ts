import { addMonths, endOfMonth, startOfMonth, subMonths } from "date-fns"
import { gte, and, inArray, lte } from "drizzle-orm"

import { db, schema } from "@/db/database"
import { DateRange } from "@/db/types"

export const MONTHS_TO_LOAD = 2

export const getStartRangeForDate = (date: Date): DateRange => {
  return {
    start: startOfMonth(subMonths(date, MONTHS_TO_LOAD)),
    end: endOfMonth(addMonths(date, MONTHS_TO_LOAD)),
  }
}

export const getCalendarEventsForRange = async (range: DateRange, calendarIds: string[]) => {
  return db
    .select()
    .from(schema.events)
    .where(
      and(
        inArray(schema.events.calendarId, calendarIds),
        gte(schema.events.start, range.start),
        lte(schema.events.start, range.end),
      ),
    )
    .orderBy(schema.events.start)
}
