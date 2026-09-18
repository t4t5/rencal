import { useCallback, useMemo, useState, type ReactNode } from "react"
import { toast } from "sonner"

import { DeleteConfirmDialog } from "@/components/event-parts/DeleteConfirmDialog"

import { rpc } from "@/rpc"

import { useCalEvents } from "@/contexts/CalEventsContext"
import { useSync } from "@/contexts/SyncContext"

import { getErrorMessage } from "@/lib/api/errors"
import { eventKey, rpcToCalendarEvent, type CalendarEvent } from "@/lib/cal-events"
import { toRpcEventTime } from "@/lib/event-time/rpc"
import { createStrictContext } from "@/lib/strict-context"

interface DeleteEventContextValue {
  // Non-recurring events get a plain confirmation.
  // Recurring events show a dialog ("Only this event", "This and future events"...)
  triggerDelete: (event: CalendarEvent) => void
}

const [DeleteEventContextProvider, useDeleteEvent] =
  createStrictContext<DeleteEventContextValue>("DeleteEvent")

export { useDeleteEvent }

/** Owns the single delete dialog, so event blocks don't each mount their own. */
export function DeleteEventProvider({ children }: { children: ReactNode }) {
  const { setActiveEventKey, setCalendarEvents } = useCalEvents()
  const { requestSync } = useSync()
  const [targetEvent, setTargetEvent] = useState<CalendarEvent | null>(null)

  // One confirmation at a time: a trigger while the dialog is open must not retarget it.
  const triggerDelete = useCallback((event: CalendarEvent) => {
    setTargetEvent((pending) => pending ?? event)
  }, [])

  const closeDialog = () => setTargetEvent(null)

  const reportError = (procedure: string, err: unknown) => {
    const message = getErrorMessage(err, "Failed to delete event")
    toast.error("Failed to delete event", { description: message })
    console.error(`${procedure} failed:`, err)
  }

  /** Drop matching events from the UI right away; returns a function that puts them back. */
  const removeOptimistically = (matches: (event: CalendarEvent) => boolean) => {
    let removed: CalendarEvent[] = []
    setCalendarEvents((prev) => {
      removed = prev.filter(matches)
      return prev.filter((e) => !matches(e))
    })
    closeDialog()
    setActiveEventKey(null)
    return () => setCalendarEvents((prev) => [...prev, ...removed])
  }

  const handleDeleteThis = async () => {
    if (!targetEvent) return
    const event = targetEvent
    const restore = removeOptimistically((e) => eventKey(e) === eventKey(event))

    try {
      await rpc.caldir.delete_event(event.calendar_slug, event.id)
      void requestSync()
    } catch (err) {
      restore()
      reportError("delete_event", err)
    }
  }

  const handleDeleteAll = async () => {
    if (!targetEvent) return
    const parentId = targetEvent.recurring_event_id ?? targetEvent.id
    const calendarSlug = targetEvent.calendar_slug

    // The series only exists in `calendarSlug`; scope the optimistic removal to
    // that calendar so an identical series in another calendar isn't dropped too.
    const restore = removeOptimistically(
      (e) =>
        e.calendar_slug === calendarSlug &&
        (e.id === parentId || e.recurring_event_id === parentId),
    )

    try {
      await rpc.caldir.delete_recurring_series(calendarSlug, parentId)
      void requestSync()
    } catch (err) {
      restore()
      reportError("delete_recurring_series", err)
    }
  }

  const handleDeleteFuture = async () => {
    if (!targetEvent) return
    const event = targetEvent
    const masterUid = event.recurring_event_id
    const calendarSlug = event.calendar_slug

    // Deleting "this and future" from the series master covers the whole series.
    if (!masterUid) return handleDeleteAll()

    // Same when the target is the first occurrence: truncating the series
    // before it would only leave behind an empty ghost master.
    try {
      const masterRpc = await rpc.caldir.get_event(calendarSlug, masterUid)
      if (masterRpc && event.dateInfo.startMs <= rpcToCalendarEvent(masterRpc).dateInfo.startMs) {
        return handleDeleteAll()
      }
    } catch {
      // Master unreadable; fall through and let the split surface the error.
    }

    const restore = removeOptimistically(
      (e) =>
        e.calendar_slug === calendarSlug &&
        (e.id === masterUid || e.recurring_event_id === masterUid) &&
        e.dateInfo.startMs >= event.dateInfo.startMs,
    )

    try {
      // There's no dedicated "delete from here" procedure: split the series at
      // this occurrence (truncating the original master and dropping later
      // overrides), then delete the new master the split created.
      const newMaster = await rpc.caldir.split_recurring_series_at({
        calendar_slug: calendarSlug,
        master_uid: masterUid,
        split_start: toRpcEventTime(event.start),
        split_end: toRpcEventTime(event.end),
        new_recurrence: null,
      })
      await rpc.caldir.delete_event(calendarSlug, newMaster.id)
      void requestSync()
    } catch (err) {
      restore()
      reportError("delete future events", err)
    }
  }

  // Keep the value stable: every event block subscribes through EventContextMenu.
  const value = useMemo(() => ({ triggerDelete }), [triggerDelete])

  return (
    <DeleteEventContextProvider value={value}>
      {children}
      <DeleteConfirmDialog
        event={targetEvent}
        onClose={closeDialog}
        onDeleteThis={handleDeleteThis}
        onDeleteFuture={handleDeleteFuture}
        onDeleteAll={handleDeleteAll}
      />
    </DeleteEventContextProvider>
  )
}
