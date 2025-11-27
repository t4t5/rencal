import { addMonths, endOfMonth, startOfMonth, subMonths } from "date-fns"
import { gte, and, inArray, lte } from "drizzle-orm"
import { RefObject, useCallback, useEffect, useRef, useState } from "react"

import { useCalendarState } from "@/contexts/CalendarStateContext"

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

export const useRollingEvents = ({
  scrollContainerRef,
}: {
  scrollContainerRef?: RefObject<HTMLDivElement | null>
}) => {
  const { calendars, activeDate } = useCalendarState()
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([])

  const visibleCalendarIds = calendars.filter((c) => c.isVisible).map((c) => c.id)

  const currentDateRangeRef = useRef<DateRange | null>(null)

  // console.log("ACTIVE", activeDate)

  const fetchEventsForRange = useCallback(
    async (range: DateRange) => {
      const events = await db
        .select()
        .from(schema.events)
        .where(
          and(
            inArray(schema.events.calendarId, visibleCalendarIds),
            gte(schema.events.start, range.start),
            lte(schema.events.start, range.end),
          ),
        )
        .orderBy(schema.events.start)

      setCalendarEvents(events)
    },
    [visibleCalendarIds],
  )

  useEffect(() => {
    const currentRange = currentDateRangeRef.current
    const activeRange = getStartRangeForDate(activeDate)

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
