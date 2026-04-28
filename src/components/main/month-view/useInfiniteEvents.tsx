import { addMonths, endOfMonth, startOfMonth, subMonths } from "date-fns"
import { useCallback, useEffect, useRef, useState } from "react"

import { useCalEvents } from "@/contexts/CalEventsContext"

import { useScrollBoundary } from "@/hooks/useScrollBoundary"
import { getCalendarEventsForRange, MONTHS_TO_LOAD } from "@/lib/cal-events-range"

// Extends the month grid and loads more events when the user scrolls near the top or bottom.
export function useInfiniteEvents({
  scrollContainerRef,
  activeDate,
  visibleCalendarIds,
}: {
  scrollContainerRef: React.RefObject<HTMLDivElement | null>
  activeDate: Date
  visibleCalendarIds: string[]
}) {
  const { setCalendarEvents, currentDateRangeRef } = useCalEvents()

  const [rangeStart, setRangeStart] = useState(() => startOfMonth(subMonths(activeDate, 2)))
  const [rangeEnd, setRangeEnd] = useState(() => startOfMonth(addMonths(activeDate, 3)))

  const isLoadingRef = useRef(false)

  // When navigation jumps activeDate outside the loaded range (e.g. typing
  // "on july 5" while the grid stops at July 1), extend the grid AND load
  // events for the gap. Without this, weeks render but appear eventless.
  const visibleCalendarKey = visibleCalendarIds.join("|")
  useEffect(() => {
    const currentRange = currentDateRangeRef.current
    if (!currentRange || isLoadingRef.current) return

    if (activeDate >= currentRange.end) {
      const newEnd = endOfMonth(addMonths(activeDate, MONTHS_TO_LOAD))
      setRangeEnd(startOfMonth(addMonths(activeDate, MONTHS_TO_LOAD)))
      isLoadingRef.current = true
      void (async () => {
        try {
          const newEvents = await getCalendarEventsForRange(
            visibleCalendarIds,
            currentRange.end,
            newEnd,
          )
          setCalendarEvents((prev) => {
            const existingIds = new Set(prev.map((e) => e.id))
            const filtered = newEvents.filter((e) => !existingIds.has(e.id))
            return filtered.length ? [...prev, ...filtered] : prev
          })
          currentDateRangeRef.current = { start: currentRange.start, end: newEnd }
        } finally {
          isLoadingRef.current = false
        }
      })()
    } else if (activeDate < currentRange.start) {
      const newStart = startOfMonth(subMonths(activeDate, MONTHS_TO_LOAD))
      isLoadingRef.current = true
      void (async () => {
        try {
          const newEvents = await getCalendarEventsForRange(
            visibleCalendarIds,
            newStart,
            currentRange.start,
          )
          setCalendarEvents((prev) => {
            const existingIds = new Set(prev.map((e) => e.id))
            const filtered = newEvents.filter((e) => !existingIds.has(e.id))
            return filtered.length ? [...filtered, ...prev] : prev
          })
          currentDateRangeRef.current = { start: newStart, end: currentRange.end }
          setRangeStart(startOfMonth(subMonths(activeDate, MONTHS_TO_LOAD)))
        } finally {
          isLoadingRef.current = false
        }
      })()
    }
  }, [activeDate, visibleCalendarKey, setCalendarEvents, currentDateRangeRef])

  useScrollBoundary({
    scrollContainerRef,
    threshold: 200,
    onNearTop: useCallback(async () => {
      if (isLoadingRef.current) return
      isLoadingRef.current = true

      try {
        // Load events BEFORE extending the grid so they're already available
        // when the new rows render (scroll adjustment makes them instantly visible)
        const currentRange = currentDateRangeRef.current
        if (!currentRange) return
        const prevStart = startOfMonth(subMonths(currentRange.start, MONTHS_TO_LOAD))
        const prevEvents = await getCalendarEventsForRange(
          visibleCalendarIds,
          prevStart,
          currentRange.start,
        )
        setCalendarEvents((prev) => {
          const existingIds = new Set(prev.map((e) => e.id))
          const newEvents = prevEvents.filter((e) => !existingIds.has(e.id))
          return newEvents.length ? [...newEvents, ...prev] : prev
        })
        currentDateRangeRef.current = { start: prevStart, end: currentRange.end }

        setRangeStart((prev) => startOfMonth(subMonths(prev, 2)))
      } finally {
        isLoadingRef.current = false
      }
    }, [visibleCalendarIds, setCalendarEvents, currentDateRangeRef]),
    onNearBottom: useCallback(async () => {
      if (isLoadingRef.current) return
      isLoadingRef.current = true

      try {
        setRangeEnd((prev) => startOfMonth(addMonths(prev, 2)))

        const currentRange = currentDateRangeRef.current
        if (!currentRange) return
        const nextEnd = endOfMonth(addMonths(currentRange.end, MONTHS_TO_LOAD))
        const nextEvents = await getCalendarEventsForRange(
          visibleCalendarIds,
          currentRange.end,
          nextEnd,
        )
        setCalendarEvents((prev) => {
          const existingIds = new Set(prev.map((e) => e.id))
          const newEvents = nextEvents.filter((e) => !existingIds.has(e.id))
          return newEvents.length ? [...prev, ...newEvents] : prev
        })
        currentDateRangeRef.current = { start: currentRange.start, end: nextEnd }
      } finally {
        isLoadingRef.current = false
      }
    }, [visibleCalendarIds, setCalendarEvents, currentDateRangeRef]),
  })

  return { rangeStart, rangeEnd }
}
