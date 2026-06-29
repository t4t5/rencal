import { useRef } from "react"

import { isAllDay, type EventTime, type EventTimeRange } from "@/lib/event-time"

export function useLastTimedRange(
  start: EventTime | null,
  end: EventTime | null,
  resetKey?: unknown,
): EventTimeRange | null {
  const resetKeyRef = useRef(resetKey)
  const lastTimedRangeRef = useRef<EventTimeRange | null>(null)

  if (!Object.is(resetKeyRef.current, resetKey)) {
    resetKeyRef.current = resetKey
    lastTimedRangeRef.current = null
  }

  if (start && end && !isAllDay(start)) {
    lastTimedRangeRef.current = { start, end }
  }

  return lastTimedRangeRef.current
}
