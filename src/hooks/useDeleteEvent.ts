import { useState } from "react"
import { toast } from "sonner"

import { rpc } from "@/rpc"

import { useCalEvents } from "@/contexts/CalEventsContext"
import { useSync } from "@/contexts/SyncContext"

import { eventKey, type CalendarEvent } from "@/lib/cal-events"

export function useDeleteEvent() {
  const { setActiveEventKey, setCalendarEvents } = useCalEvents()
  const { requestSync } = useSync()
  const [targetEvent, setTargetEvent] = useState<CalendarEvent | null>(null)

  const isRecurring = !!(targetEvent?.recurring_event_id || targetEvent?.recurrence)

  const triggerDelete = (event: CalendarEvent) => {
    setTargetEvent(event)
  }

  const handleDeleteThis = async () => {
    if (!targetEvent) return

    const event = targetEvent

    // Optimistically remove from UI immediately
    setCalendarEvents((prev) => prev.filter((e) => eventKey(e) !== eventKey(event)))
    setTargetEvent(null)
    setActiveEventKey(null)

    try {
      await rpc.caldir.delete_event(event.calendar_slug, event.id)
      void requestSync()
    } catch (err) {
      setCalendarEvents((prev) => [...prev, event])
      const message = err instanceof Error ? err.message : String(err)
      toast.error("Failed to delete event", { description: message })
      console.error("delete_event failed:", err)
    }
  }

  const handleDeleteAll = async () => {
    if (!targetEvent) return

    const parentId = targetEvent.recurring_event_id ?? targetEvent.id
    const calendarSlug = targetEvent.calendar_slug

    // The series only exists in `calendarSlug`; scope the optimistic removal to
    // that calendar so an identical series in another calendar isn't dropped too.
    const isInSeries = (e: CalendarEvent) =>
      e.calendar_slug === calendarSlug && (e.id === parentId || e.recurring_event_id === parentId)

    // Optimistically remove all events in the series from UI
    let removed: CalendarEvent[] = []
    setCalendarEvents((prev) => {
      removed = prev.filter(isInSeries)
      return prev.filter((e) => !isInSeries(e))
    })
    setTargetEvent(null)
    setActiveEventKey(null)

    try {
      await rpc.caldir.delete_recurring_series(calendarSlug, parentId)
      void requestSync()
    } catch (err) {
      setCalendarEvents((prev) => [...prev, ...removed])
      const message = err instanceof Error ? err.message : String(err)
      toast.error("Failed to delete event", { description: message })
      console.error("delete_recurring_series failed:", err)
    }
  }

  const handleClose = () => {
    setTargetEvent(null)
  }

  return {
    triggerDelete,
    deleteDialogProps: {
      open: !!targetEvent,
      isRecurring,
      onClose: handleClose,
      onDeleteThis: handleDeleteThis,
      onDeleteAll: handleDeleteAll,
    },
  }
}
