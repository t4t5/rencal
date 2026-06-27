import { addDays, isSameDay, startOfWeek, subDays } from "date-fns"
import { RefObject, useCallback, useEffect, useMemo, useState } from "react"

import { useCalEvents } from "@/contexts/CalEventsContext"

import { useScrollBoundary } from "@/hooks/useScrollBoundary"
import { useToday } from "@/hooks/useToday"
import { formatDateKey } from "@/lib/event-time"

import type { MonthDay } from "./useMonthGrid"

const BUFFER_DAYS = 7
const INITIAL_RANGE_DAYS = 21

/** Seed the day range: activeDate's Mon–Sun week, with BUFFER_DAYS extra on each side. */
function initialRangeStart(activeDate: Date): Date {
  const weekStart = startOfWeek(activeDate, { weekStartsOn: 1 })
  return subDays(weekStart, BUFFER_DAYS)
}

function buildDay(date: Date, today: Date): MonthDay {
  return {
    date,
    dateKey: formatDateKey(date),
    isToday: isSameDay(date, today),
    isWeekend: date.getDay() === 0 || date.getDay() === 6,
  }
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
  activeDate: Date
  visibleCalendarIds: string[]
}): { days: MonthDay[] } {
  const { ensureRangeLoaded } = useCalEvents()
  const today = useToday()

  const [rangeStart, setRangeStart] = useState(() => initialRangeStart(activeDate))
  const [count, setCount] = useState(INITIAL_RANGE_DAYS)

  // If activeDate jumps outside the rendered range, reset around it.
  const rangeEnd = useMemo(() => addDays(rangeStart, count - 1), [rangeStart, count])
  if (activeDate < rangeStart || activeDate > rangeEnd) {
    const newStart = initialRangeStart(activeDate)
    if (!isSameDay(newStart, rangeStart) || count !== INITIAL_RANGE_DAYS) {
      setRangeStart(newStart)
      setCount(INITIAL_RANGE_DAYS)
    }
  }

  const days = useMemo(() => {
    return Array.from({ length: count }, (_, i) => buildDay(addDays(rangeStart, i), today))
  }, [rangeStart, count, today])

  // Keep loaded events in step with the rendered days. The end is exclusive (start of the
  // day after the last rendered day) so the final day's events are covered, matching the
  // [gridStart, gridEnd) convention the month grid loads with.
  const visibleCalendarKey = visibleCalendarIds.join("|")
  useEffect(() => {
    void ensureRangeLoaded(rangeStart, addDays(rangeEnd, 1))
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
      setRangeStart((d) => subDays(d, BUFFER_DAYS))
      setCount((n) => n + BUFFER_DAYS)
    }, []),
    onNearRight: useCallback(() => {
      setCount((n) => n + BUFFER_DAYS)
    }, []),
  })

  return { days }
}
