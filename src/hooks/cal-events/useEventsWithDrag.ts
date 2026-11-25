import { useMemo } from "react"

import { useEventDrag } from "@/contexts/EventDragContext"

import { eventKey, type CalendarEvent } from "@/lib/cal-events"

/**
 * Adds the drag-to-reschedule preview to the events a grid lays out, so it
 * lands in its natural lane/slot at the drop position. When moving, the source
 * event stays in the list (blocks dim it via `useEventDragRole`); when
 * resizing, the preview takes its place so the event stretches in place.
 */
export function useEventsWithDrag(events: CalendarEvent[]): CalendarEvent[] {
  const { drag } = useEventDrag()
  const preview = drag?.preview ?? null
  const replacedKey = drag?.resize ? drag.sourceKey : null

  return useMemo(() => {
    if (!preview) return events
    const rest = replacedKey ? events.filter((e) => eventKey(e) !== replacedKey) : events
    return [...rest, preview]
  }, [events, preview, replacedKey])
}
