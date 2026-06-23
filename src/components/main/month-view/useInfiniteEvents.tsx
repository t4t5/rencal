import { addMonths, endOfMonth, startOfMonth, subMonths } from "date-fns"
import { useCallback, useEffect, useRef, useState } from "react"

import { useCalEvents } from "@/contexts/CalEventsContext"

import { useScrollBoundary } from "@/hooks/useScrollBoundary"
import { CalendarEvent, eventKey } from "@/lib/cal-events"
import { getCalendarEventsForRange, MONTHS_TO_LOAD } from "@/lib/cal-events-range"
import { isDebugMode } from "@/lib/debug"
import { DateRange } from "@/lib/types"

const DEBUG_MONTH_SCROLL = isDebugMode("month-scroll")

function debugMonthScroll(message: string, data?: Record<string, unknown>) {
  if (!DEBUG_MONTH_SCROLL) return
  console.debug(`[MonthScroll] ${message}`, data ?? {})
}

function mergeEvents(
  prev: CalendarEvent[],
  incoming: CalendarEvent[],
  position: "append" | "prepend",
): CalendarEvent[] {
  const existingKeys = new Set(prev.map(eventKey))
  const filtered = incoming.filter((e) => !existingKeys.has(eventKey(e)))
  if (!filtered.length) return prev
  return position === "append" ? [...prev, ...filtered] : [...filtered, ...prev]
}

function fallbackLoadedRange(gridRange: DateRange): DateRange {
  return {
    start: gridRange.start,
    // rangeEnd is the first day of the next unloaded month; event ranges use an inclusive end.
    end: endOfMonth(subMonths(gridRange.end, 1)),
  }
}

// The month grid itself is infinite. Event loading is best-effort and follows the
// rendered grid range, but an empty calendar must not block extending the grid.
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

  const gridRangeRef = useRef<DateRange>({ start: rangeStart, end: rangeEnd })
  gridRangeRef.current = { start: rangeStart, end: rangeEnd }

  const isLoadingEventsRef = useRef(false)

  const extendBackward = useCallback(
    async (newStart: Date) => {
      const gridRange = gridRangeRef.current
      if (newStart >= gridRange.start) return

      debugMonthScroll("extend grid backward", { from: gridRange.start, to: newStart })
      setRangeStart(newStart)

      if (isLoadingEventsRef.current) return
      isLoadingEventsRef.current = true
      try {
        const loadedRange = currentDateRangeRef.current ?? fallbackLoadedRange(gridRange)
        if (newStart >= loadedRange.start) return

        if (!visibleCalendarIds.length) {
          currentDateRangeRef.current = { start: newStart, end: loadedRange.end }
          debugMonthScroll("skip backward event load: no visible calendars")
          return
        }

        debugMonthScroll("load events backward", { start: newStart, end: loadedRange.start })
        const events = await getCalendarEventsForRange(
          visibleCalendarIds,
          newStart,
          loadedRange.start,
        )
        setCalendarEvents((prev) => mergeEvents(prev, events, "prepend"))
        currentDateRangeRef.current = { start: newStart, end: loadedRange.end }
      } finally {
        isLoadingEventsRef.current = false
      }
    },
    [currentDateRangeRef, setCalendarEvents, visibleCalendarIds],
  )

  const extendForward = useCallback(
    async (newEnd: Date) => {
      const gridRange = gridRangeRef.current
      const newGridEnd = startOfMonth(addMonths(newEnd, 1))
      if (newGridEnd <= gridRange.end) return

      debugMonthScroll("extend grid forward", { from: gridRange.end, to: newGridEnd })
      setRangeEnd(newGridEnd)

      if (isLoadingEventsRef.current) return
      isLoadingEventsRef.current = true
      try {
        const loadedRange = currentDateRangeRef.current ?? fallbackLoadedRange(gridRange)
        if (newEnd <= loadedRange.end) return

        if (!visibleCalendarIds.length) {
          currentDateRangeRef.current = { start: loadedRange.start, end: newEnd }
          debugMonthScroll("skip forward event load: no visible calendars")
          return
        }

        debugMonthScroll("load events forward", { start: loadedRange.end, end: newEnd })
        const events = await getCalendarEventsForRange(visibleCalendarIds, loadedRange.end, newEnd)
        setCalendarEvents((prev) => mergeEvents(prev, events, "append"))
        currentDateRangeRef.current = { start: loadedRange.start, end: newEnd }
      } finally {
        isLoadingEventsRef.current = false
      }
    },
    [currentDateRangeRef, setCalendarEvents, visibleCalendarIds],
  )

  // Jump-navigation: activeDate moved outside the rendered grid.
  const visibleCalendarKey = visibleCalendarIds.join("|")
  useEffect(() => {
    const gridRange = gridRangeRef.current
    if (activeDate < gridRange.start) {
      void extendBackward(startOfMonth(subMonths(activeDate, MONTHS_TO_LOAD)))
    } else if (activeDate >= gridRange.end) {
      void extendForward(endOfMonth(addMonths(activeDate, MONTHS_TO_LOAD)))
    }
  }, [activeDate, visibleCalendarKey, extendBackward, extendForward])

  useScrollBoundary({
    scrollContainerRef,
    threshold: 200,
    checkOnMount: false,
    requireScrollAwayBeforeBoundary: true,
    onNearTop: useCallback(() => {
      const { start } = gridRangeRef.current
      void extendBackward(startOfMonth(subMonths(start, MONTHS_TO_LOAD)))
    }, [extendBackward]),
    onNearBottom: useCallback(() => {
      const loadedEnd = endOfMonth(subMonths(gridRangeRef.current.end, 1))
      void extendForward(endOfMonth(addMonths(loadedEnd, MONTHS_TO_LOAD)))
    }, [extendForward]),
  })

  return { rangeStart, rangeEnd }
}
