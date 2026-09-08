import { useMemo } from "react"

import { useEventDrag } from "@/contexts/EventDragContext"

import type { CalendarEvent } from "@/lib/cal-events"

/**
 * Adds the drag-to-reschedule preview to the events a grid lays out, so it
 * lands in its natural lane/slot at the drop position. The source event stays
 * in the list (blocks dim it via `useEventDragRole`).
 */
export function useEventsWithDrag(events: CalendarEvent[]): CalendarEvent[] {
  const { drag } = useEventDrag()
  const preview = drag?.preview ?? null

  return useMemo(() => (preview ? [...events, preview] : events), [events, preview])
}
