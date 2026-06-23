import { addMonths, startOfMonth, startOfWeek, subMonths } from "date-fns"
import { RefObject, useCallback, useEffect, useState } from "react"

import { useCalEvents } from "@/contexts/CalEventsContext"

import { useScrollBoundary } from "@/hooks/useScrollBoundary"
import { MONTHS_TO_LOAD } from "@/lib/cal-events-range"
import { createDebugLogger } from "@/lib/debug"

const debugMonthScroll = createDebugLogger("month-scroll")

// rangeStart / rangeEnd are the 1st of a month; rangeEnd is exclusive (the 1st of the first
// not-yet-rendered month), matching useMonthGrid.
const rangeStartFor = (date: Date) => startOfMonth(subMonths(date, MONTHS_TO_LOAD))
const rangeEndFor = (date: Date) => startOfMonth(addMonths(date, MONTHS_TO_LOAD + 1))

/**
 * Owns the growing month range rendered by the infinite month grid. The grid is the source
 * of truth for what's visible; event loading just follows it via `ensureRangeLoaded` and
 * never blocks scrolling (see docs/scroll-behaviour.md).
 */
export function useInfiniteMonths({
  scrollContainerRef,
  activeDate,
  visibleCalendarIds,
}: {
  scrollContainerRef: RefObject<HTMLDivElement | null>
  activeDate: Date
  visibleCalendarIds: string[]
}) {
  const { ensureRangeLoaded } = useCalEvents()

  const [rangeStart, setRangeStart] = useState(() => rangeStartFor(activeDate))
  const [rangeEnd, setRangeEnd] = useState(() => rangeEndFor(activeDate))

  // Jump navigation: if activeDate lands outside the rendered range, extend toward it.
  useEffect(() => {
    if (activeDate < rangeStart) {
      setRangeStart(rangeStartFor(activeDate))
    } else if (activeDate >= rangeEnd) {
      setRangeEnd(rangeEndFor(activeDate))
    }
  }, [activeDate, rangeStart, rangeEnd])

  // Keep loaded events in step with the rendered weeks. The bounds match useMonthGrid's
  // gridStart/gridEnd exactly so coverage lines up with what's on screen.
  const visibleCalendarKey = visibleCalendarIds.join("|")
  useEffect(() => {
    const gridStart = startOfWeek(rangeStart, { weekStartsOn: 1 })
    const gridEnd = startOfWeek(rangeEnd, { weekStartsOn: 1 })
    debugMonthScroll("ensure month range loaded", { gridStart, gridEnd })
    void ensureRangeLoaded(gridStart, gridEnd)
  }, [rangeStart, rangeEnd, visibleCalendarKey, ensureRangeLoaded])

  useScrollBoundary({
    scrollContainerRef,
    threshold: 200,
    checkOnMount: false,
    requireScrollAwayBeforeBoundary: true,
    onNearTop: useCallback(() => {
      // Prepending shifts the viewport away from the top (Grid preserves scroll offset),
      // so this fires once per approach rather than runaway-growing.
      setRangeStart((s) => startOfMonth(subMonths(s, MONTHS_TO_LOAD)))
    }, []),
    onNearBottom: useCallback(() => {
      setRangeEnd((e) => startOfMonth(addMonths(e, MONTHS_TO_LOAD)))
    }, []),
  })

  return { rangeStart, rangeEnd }
}
