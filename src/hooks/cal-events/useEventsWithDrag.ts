import { useMemo } from "react"

import { useEventDrag } from "@/contexts/EventDragContext"
import { useRecurrenceEdit } from "@/contexts/RecurrenceEditContext"

import { eventKey, type CalendarEvent } from "@/lib/cal-events"
import { withPendingEdits } from "@/lib/recurrence-edit"

/**
 * Adds the drag-to-reschedule preview to the events a grid lays out, so it
 * lands in its natural lane/slot at the drop position. When moving, the source
 * event stays in the list (blocks dim it via `useEventDragRole`); when
 * resizing, the preview takes its place so the event stretches in place.
 *
 * A recurring occurrence whose edit waits on the "Only this event / All
 * events" dialog, or on the save chosen there, is drawn as edited, so a
 * dropped or resized event stays where it was left.
 */
export function useEventsWithDrag(events: CalendarEvent[]): CalendarEvent[] {
  const { drag } = useEventDrag()
  const { pendingEdits } = useRecurrenceEdit()
  const preview = drag?.preview ?? null
  const replacedKey = drag?.resize ? drag.sourceKey : null

  return useMemo(() => {
    const shown = withPendingEdits(events, pendingEdits)
    if (!preview) return shown
    const rest = replacedKey ? shown.filter((e) => eventKey(e) !== replacedKey) : shown
    return [...rest, preview]
  }, [events, pendingEdits, preview, replacedKey])
}
