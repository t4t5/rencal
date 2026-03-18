import { useState } from "react"

import { rpc } from "@/rpc"
import type { CalendarEvent } from "@/rpc/bindings"

import { useCalEvents } from "@/contexts/CalEventsContext"

export function useDeleteEvent() {
  const { setActiveEventId, reloadEvents } = useCalEvents()
  const [targetEvent, setTargetEvent] = useState<CalendarEvent | null>(null)

  const isRecurring = !!(targetEvent?.recurring_event_id || targetEvent?.recurrence)

  const triggerDelete = (event: CalendarEvent) => {
    setTargetEvent(event)
  }

  const handleDeleteThis = async () => {
    if (!targetEvent) return

    await rpc.caldir.delete_event(targetEvent.calendar_slug, targetEvent.id)

    setTargetEvent(null)
    setActiveEventId(null)
    await reloadEvents()
  }

  const handleDeleteAll = async () => {
    if (!targetEvent) return

    const parentId = targetEvent.recurring_event_id ?? targetEvent.id

    await rpc.caldir.delete_recurring_series(targetEvent.calendar_slug, parentId)

    setTargetEvent(null)
    setActiveEventId(null)
    await reloadEvents()
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
