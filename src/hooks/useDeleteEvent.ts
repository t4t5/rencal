import { useState } from "react"

import { rpc } from "@/rpc"

import { useCalEvents } from "@/contexts/CalEventsContext"
import { useSync } from "@/contexts/SyncContext"

import type { CalendarEvent } from "@/lib/cal-events"

export function useDeleteEvent() {
  const { setActiveEventId, setCalendarEvents } = useCalEvents()
  const { requestSync } = useSync()
  const [targetEvent, setTargetEvent] = useState<CalendarEvent | null>(null)

  const isRecurring = !!(targetEvent?.recurring_event_id || targetEvent?.recurrence)

  const triggerDelete = (event: CalendarEvent) => {
    setTargetEvent(event)
  }

  const handleDeleteThis = async () => {
    if (!targetEvent) return

    // Optimistically remove from UI immediately
    setCalendarEvents((prev) => prev.filter((e) => e.id !== targetEvent.id))
    setTargetEvent(null)
    setActiveEventId(null)

    await rpc.caldir.delete_event(targetEvent.calendar_slug, targetEvent.id)
    void requestSync()
  }

  const handleDeleteAll = async () => {
    if (!targetEvent) return

    const parentId = targetEvent.recurring_event_id ?? targetEvent.id

    // Optimistically remove all events in the series from UI
    setCalendarEvents((prev) =>
      prev.filter((e) => e.id !== parentId && e.recurring_event_id !== parentId),
    )
    setTargetEvent(null)
    setActiveEventId(null)

    await rpc.caldir.delete_recurring_series(targetEvent.calendar_slug, parentId)
    void requestSync()
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
