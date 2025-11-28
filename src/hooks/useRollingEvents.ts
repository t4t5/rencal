import { addMonths, endOfMonth, startOfMonth, subMonths } from "date-fns"
import { RefObject, useCallback } from "react"

import { useCalEvents } from "@/contexts/CalEventsContext"
import { useCalendarState } from "@/contexts/CalendarStateContext"

import { useScrollBoundary } from "@/hooks/useScrollBoundary"
import { getCalendarEventsForRange, MONTHS_TO_LOAD } from "@/lib/cal-events-range"

export const useRollingEvents = ({
  scrollContainerRef,
}: {
  scrollContainerRef: RefObject<HTMLDivElement | null>
}) => {
  const { calendars } = useCalendarState()
  const { currentDateRangeRef, setCalendarEvents } = useCalEvents()

  const visibleCalendarIds = calendars.filter((c) => c.isVisible).map((c) => c.id)

  const onNearTop = useCallback(async () => {
    const currentRange = currentDateRangeRef.current
    if (!currentRange) return

    // Load events for prev range and append them:
    const prevStart = startOfMonth(subMonths(currentRange.start, MONTHS_TO_LOAD))
    const prevRange = { start: prevStart, end: currentRange.start }
    const prevEvents = await getCalendarEventsForRange(prevRange, visibleCalendarIds)

    setCalendarEvents((prev) => {
      const existingIds = new Set(prev.map((e) => e.id))
      const newEvents = prevEvents.filter((e) => !existingIds.has(e.id))

      if (newEvents.length) {
        return [...newEvents, ...prev]
      } else {
        return prev
      }
    })

    currentDateRangeRef.current = {
      start: prevStart,
      end: currentRange.end,
    }
  }, [visibleCalendarIds])

  const onNearBottom = useCallback(async () => {
    const currentRange = currentDateRangeRef.current
    if (!currentRange) return

    // Load events for next range and append them:
    const nextEnd = endOfMonth(addMonths(currentRange.end, MONTHS_TO_LOAD))
    const nextRange = { start: currentRange.end, end: nextEnd }
    const nextEvents = await getCalendarEventsForRange(nextRange, visibleCalendarIds)

    setCalendarEvents((prev) => {
      const existingIds = new Set(prev.map((e) => e.id))
      const newEvents = nextEvents.filter((e) => !existingIds.has(e.id))

      if (newEvents.length) {
        return [...prev, ...newEvents]
      } else {
        return prev
      }
    })

    currentDateRangeRef.current = {
      start: currentRange.start,
      end: nextEnd,
    }
  }, [visibleCalendarIds])

  useScrollBoundary({
    scrollContainerRef,
    threshold: 200,
    onNearTop,
    onNearBottom,
  })
}
