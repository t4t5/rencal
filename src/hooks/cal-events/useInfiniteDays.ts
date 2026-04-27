import { addDays, isSameDay, startOfWeek, subDays } from "date-fns"
import { RefObject, useCallback, useMemo, useRef, useState } from "react"

import { useScrollBoundary } from "@/hooks/useScrollBoundary"
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
 * Manages a growing range of days for the continuously-scrollable week view.
 * Start is a Monday (activeDate's week Monday, minus one buffer week); new weeks are
 * prepended/appended when the user scrolls within `threshold` px of either edge.
 */
export function useInfiniteDays({
  scrollContainerRef,
  activeDate,
}: {
  scrollContainerRef: RefObject<HTMLDivElement | null>
  activeDate: Date
}): { days: MonthDay[] } {
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
    const today = new Date()
    return Array.from({ length: count }, (_, i) => buildDay(addDays(rangeStart, i), today))
  }, [rangeStart, count])

  const isLoadingRef = useRef(false)

  const onNearLeft = useCallback(() => {
    if (isLoadingRef.current) return
    isLoadingRef.current = true
    setRangeStart((d) => subDays(d, BUFFER_DAYS))
    setCount((n) => n + BUFFER_DAYS)
    // Reset flag on next animation frame so consecutive scrolls can keep growing
    requestAnimationFrame(() => {
      isLoadingRef.current = false
    })
  }, [])

  const onNearRight = useCallback(() => {
    if (isLoadingRef.current) return
    isLoadingRef.current = true
    setCount((n) => n + BUFFER_DAYS)
    requestAnimationFrame(() => {
      isLoadingRef.current = false
    })
  }, [])

  useScrollBoundary({
    scrollContainerRef,
    axis: "x",
    threshold: 200,
    onNearLeft,
    onNearRight,
  })

  return { days }
}
