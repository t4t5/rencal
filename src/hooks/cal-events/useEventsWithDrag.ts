import { useMemo } from "react"

import { useEventDrag } from "@/contexts/EventDragContext"
import { useRecurrenceEdit } from "@/contexts/RecurrenceEditContext"

import type { CalendarEvent } from "@/lib/cal-events"
import { withPendingEdits } from "@/lib/recurrence-edit"

/**
 * Adds the drag-to-reschedule preview to the events a grid lays out, so it
 * lands in its natural lane/slot at the drop position. The source event stays
 * in the list (blocks dim it via `useEventDragRole`).
 *
 * A recurring occurrence whose edit waits on the "Only this event / All
 * events" dialog, or on the save chosen there, is drawn as edited, so a
 * dropped event stays where it was dropped.
 */
export function useEventsWithDrag(events: CalendarEvent[]): CalendarEvent[] {
  const { drag } = useEventDrag()
  const { pendingEdits } = useRecurrenceEdit()
  const preview = drag?.preview ?? null

  return useMemo(() => {
    const shown = withPendingEdits(events, pendingEdits)
    return preview ? [...shown, preview] : shown
  }, [events, pendingEdits, preview])
}
