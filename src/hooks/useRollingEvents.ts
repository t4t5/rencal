import { addMonths, endOfMonth, startOfMonth, subMonths } from "date-fns"
import { gte, and, inArray, lte } from "drizzle-orm"
import { RefObject, useCallback, useEffect, useRef, useState } from "react"

import { useCalendarState } from "@/contexts/CalendarStateContext"

import { useScrollBoundary } from "@/hooks/useScrollBoundary"

import { db, schema } from "@/db/database"
import { CalendarEvent } from "@/db/types"

interface DateRange {
  start: Date
  end: Date
}

const MONTHS_TO_LOAD = 2

const getStartRangeForDate = (date: Date): DateRange => {
  return {
    start: startOfMonth(subMonths(date, MONTHS_TO_LOAD)),
    end: endOfMonth(addMonths(date, MONTHS_TO_LOAD)),
  }
}

const getCalendarEventsForRange = async (range: DateRange, calendarIds: string[]) => {
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

export const useRollingEvents = ({
  scrollContainerRef,
}: {
  scrollContainerRef: RefObject<HTMLDivElement | null>
}) => {
  const { calendars, activeDate } = useCalendarState()
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([])

  const visibleCalendarIds = calendars.filter((c) => c.isVisible).map((c) => c.id)

  const currentDateRangeRef = useRef<DateRange | null>(null)

  // console.log("ACTIVE", activeDate)

  const fetchEventsForRange = useCallback(
    async (range: DateRange) => {
      const events = await getCalendarEventsForRange(range, visibleCalendarIds)
      setCalendarEvents(events)
    },
    [visibleCalendarIds],
  )

  useScrollBoundary({
    scrollContainerRef,
    threshold: 100,
    throttleMs: 150,
    onNearTop: () => console.log("Near top!"),
    onNearBottom: () => console.log("Near bottom!"),
  })

  useEffect(() => {
    const currentRange = currentDateRangeRef.current
    const activeRange = getStartRangeForDate(activeDate)

    // Core data hasn't loaded yet:
    if (!visibleCalendarIds.length || !activeDate) {
      return
    }

    // Initialize on first run:
    if (!currentRange) {
      currentDateRangeRef.current = activeRange
      void fetchEventsForRange(activeRange)
    }
  }, [activeDate, visibleCalendarIds])

  return { calendarEvents }
}
