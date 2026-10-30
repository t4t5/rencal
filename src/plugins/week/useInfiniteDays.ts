import { Temporal } from "@js-temporal/polyfill"
import { type RefObject, useCallback, useMemo, useState } from "react"

import {
  type FirstDayOfWeek,
  startOfWeek,
  useDisplaySettings,
  useScrollBoundary,
  useToday,
} from "@/sdk"

const BUFFER_DAYS = 7
const INITIAL_RANGE_DAYS = 21

export type WeekDay = {
  date: Temporal.PlainDate
  dateKey: string
  isToday: boolean
  isWeekend: boolean
}

function buildDay(date: Temporal.PlainDate, today: Temporal.PlainDate): WeekDay {
  return {
    date,
    dateKey: date.toString(),
    isToday: date.equals(today),
    isWeekend: date.dayOfWeek === 6 || date.dayOfWeek === 7,
  }
}

/** Seed the day range: activeDate's week, with BUFFER_DAYS extra on each side. */
function initialRangeStart(
  activeDate: Temporal.PlainDate,
  firstDayOfWeek: FirstDayOfWeek,
): Temporal.PlainDate {
  return startOfWeek(activeDate, firstDayOfWeek).subtract({ days: BUFFER_DAYS })
}

/**
 * Manages a growing range of days for the continuously-scrollable week view. The day range
 * is the source of truth for what's rendered; the caller loads events for [start, end).
 * Start is aligned to the first day of activeDate's week (minus one buffer week); new
 * weeks are prepended/appended when the user scrolls within `threshold` px of either edge.
 */
export function useInfiniteDays({
  scrollContainerRef,
  activeDate,
}: {
  scrollContainerRef: RefObject<HTMLDivElement | null>
  activeDate: Temporal.PlainDate
}): { days: WeekDay[]; start: Temporal.PlainDate; end: Temporal.PlainDate } {
  const { firstDayOfWeek } = useDisplaySettings()
  const today = useToday()

  const [rangeStart, setRangeStart] = useState(() => initialRangeStart(activeDate, firstDayOfWeek))
  const [count, setCount] = useState(INITIAL_RANGE_DAYS)

  // If activeDate jumps outside the rendered range, reset around it.
  const rangeEnd = useMemo(() => rangeStart.add({ days: count - 1 }), [rangeStart, count])
  if (
    Temporal.PlainDate.compare(activeDate, rangeStart) < 0 ||
    Temporal.PlainDate.compare(activeDate, rangeEnd) > 0
  ) {
    const newStart = initialRangeStart(activeDate, firstDayOfWeek)
    if (!newStart.equals(rangeStart) || count !== INITIAL_RANGE_DAYS) {
      setRangeStart(newStart)
      setCount(INITIAL_RANGE_DAYS)
    }
  }

  const days = useMemo(() => {
    return Array.from({ length: count }, (_, i) => buildDay(rangeStart.add({ days: i }), today))
  }, [rangeStart, count, today])

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

  // The end is exclusive (the day after the last rendered day) so the final day's
  // events are covered, matching the [gridStart, gridEnd) convention of the month grid.
  return { days, start: rangeStart, end: rangeEnd.add({ days: 1 }) }
}
