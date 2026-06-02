import { useState } from "react"
import { toast } from "sonner"

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

    const event = targetEvent

    // Optimistically remove from UI immediately
    setCalendarEvents((prev) => prev.filter((e) => e.id !== event.id))
    setTargetEvent(null)
    setActiveEventId(null)

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

    // Optimistically remove all events in the series from UI
    let removed: CalendarEvent[] = []
    setCalendarEvents((prev) => {
      removed = prev.filter((e) => e.id === parentId || e.recurring_event_id === parentId)
      return prev.filter((e) => e.id !== parentId && e.recurring_event_id !== parentId)
    })
    setTargetEvent(null)
    setActiveEventId(null)

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
