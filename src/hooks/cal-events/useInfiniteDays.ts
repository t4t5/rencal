import { Temporal } from "@js-temporal/polyfill"
import { RefObject, useCallback, useEffect, useMemo, useState } from "react"

import { useCalEvents } from "@/contexts/CalEventsContext"

import { useScrollBoundary } from "@/hooks/useScrollBoundary"
import { useToday } from "@/hooks/useToday"
import { startOfWeek } from "@/lib/event-time"

import { buildDay, type MonthDay } from "./useMonthGrid"

const BUFFER_DAYS = 7
const INITIAL_RANGE_DAYS = 21

/** Seed the day range: activeDate's Mon–Sun week, with BUFFER_DAYS extra on each side. */
function initialRangeStart(activeDate: Temporal.PlainDate): Temporal.PlainDate {
  return startOfWeek(activeDate).subtract({ days: BUFFER_DAYS })
}

/**
 * Manages a growing range of days for the continuously-scrollable week view. The day range
 * is the source of truth for what's rendered; event loading just follows it via
 * `ensureRangeLoaded` and never blocks scrolling (mirrors useInfiniteMonths).
 * Start is a Monday (activeDate's week Monday, minus one buffer week); new weeks are
 * prepended/appended when the user scrolls within `threshold` px of either edge.
 */
export function useInfiniteDays({
  scrollContainerRef,
  activeDate,
  visibleCalendarIds,
}: {
  scrollContainerRef: RefObject<HTMLDivElement | null>
  activeDate: Temporal.PlainDate
  visibleCalendarIds: string[]
}): { days: MonthDay[] } {
  const { ensureRangeLoaded } = useCalEvents()
  const today = useToday()

  const [rangeStart, setRangeStart] = useState(() => initialRangeStart(activeDate))
  const [count, setCount] = useState(INITIAL_RANGE_DAYS)

  // If activeDate jumps outside the rendered range, reset around it.
  const rangeEnd = useMemo(() => rangeStart.add({ days: count - 1 }), [rangeStart, count])
  if (
    Temporal.PlainDate.compare(activeDate, rangeStart) < 0 ||
    Temporal.PlainDate.compare(activeDate, rangeEnd) > 0
  ) {
    const newStart = initialRangeStart(activeDate)
    if (!newStart.equals(rangeStart) || count !== INITIAL_RANGE_DAYS) {
      setRangeStart(newStart)
      setCount(INITIAL_RANGE_DAYS)
    }
  }

  const days = useMemo(() => {
    return Array.from({ length: count }, (_, i) => buildDay(rangeStart.add({ days: i }), today))
  }, [rangeStart, count, today])

  // Keep loaded events in step with the rendered days. The end is exclusive (start of the
  // day after the last rendered day) so the final day's events are covered, matching the
  // [gridStart, gridEnd) convention the month grid loads with.
  const visibleCalendarKey = visibleCalendarIds.join("|")
  useEffect(() => {
    void ensureRangeLoaded(rangeStart, rangeEnd.add({ days: 1 }))
  }, [rangeStart, rangeEnd, visibleCalendarKey, ensureRangeLoaded])

  useScrollBoundary({
    scrollContainerRef,
    axis: "x",
    threshold: 200,
    checkOnMount: false,
    requireScrollAwayBeforeBoundary: true,
    onNearLeft: useCallback(() => {
      // Prepending shifts the viewport away from the left edge (WeekTimeGrid preserves
      // scrollLeft), so this fires once per approach rather than runaway-growing.
      setRangeStart((date) => date.subtract({ days: BUFFER_DAYS }))
      setCount((n) => n + BUFFER_DAYS)
    }, []),
    onNearRight: useCallback(() => {
      setCount((n) => n + BUFFER_DAYS)
    }, []),
  })

  return { days }
}
