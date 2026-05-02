import { createContext, useContext, useState, type ReactNode } from "react"
import { toast } from "sonner"

import { RecurrenceConfirmDialog } from "@/components/event-parts/RecurrenceConfirmDialog"

import { rpc } from "@/rpc"

import { useCalEvents } from "@/contexts/CalEventsContext"
import { useSync } from "@/contexts/SyncContext"

import { recurrenceToRpc, rpcToCalendarEvent, type CalendarEvent } from "@/lib/cal-events"
import { addMinutes, instantForOrdering, wallclockTime, withWallclockTime } from "@/lib/event-time"
import { toRpcEventTime } from "@/lib/event-time/rpc"
import { updateAndSyncEvent } from "@/lib/save-event"

type PendingEdit = { current: CalendarEvent; original: CalendarEvent }

interface RecurrenceEditContextValue {
  /**
   * Save an edited event. Non-recurring events flush directly. Recurring
   * instances are routed through a scope-picker dialog so the user chooses
   * whether the change applies to only this occurrence, all future
   * occurrences, or every occurrence.
   */
  requestSave: (current: CalendarEvent, original: CalendarEvent) => void
}

const RecurrenceEditContext = createContext<RecurrenceEditContextValue | null>(null)

export function useRecurrenceEdit(): RecurrenceEditContextValue {
  const ctx = useContext(RecurrenceEditContext)
  if (!ctx) throw new Error("useRecurrenceEdit must be used within RecurrenceEditProvider")
  return ctx
}

export function RecurrenceEditProvider({ children }: { children: ReactNode }) {
  const { setCalendarEvents, reloadEvents } = useCalEvents()
  const { requestSync } = useSync()
  const [pendingEdit, setPendingEdit] = useState<PendingEdit | null>(null)

  const requestSave = (current: CalendarEvent, original: CalendarEvent) => {
    if (current.recurring_event_id !== null) {
      setPendingEdit({ current, original })
      return
    }
    void updateAndSyncEvent(current, original, setCalendarEvents, requestSync)
  }

  const closeDialog = () => setPendingEdit(null)

  const reportError = (err: unknown) => {
    const message = err instanceof Error ? err.message : String(err)
    toast.error("Failed to save event", { description: message })
    console.error("recurring update failed:", err)
  }

  const handleApplyToThis = async () => {
    if (!pendingEdit) return
    const { current, original } = pendingEdit
    closeDialog()
    // The backend's update_event detects synthetic instance ids and creates
    // an override file inheriting the master's metadata.
    await updateAndSyncEvent(current, original, setCalendarEvents, requestSync)
  }

  const handleApplyToFuture = async () => {
    if (!pendingEdit) return
    const { current } = pendingEdit
    if (!current.recurring_event_id || !current.master_recurrence) {
      closeDialog()
      return
    }
    closeDialog()

    try {
      const newMasterRpc = await rpc.caldir.split_recurring_series_at({
        calendar_slug: current.calendar_slug,
        master_uid: current.recurring_event_id,
        split_start: toRpcEventTime(current.start),
        split_end: toRpcEventTime(current.end),
        new_recurrence: recurrenceToRpc(current.master_recurrence),
      })

      const newMaster = rpcToCalendarEvent(newMasterRpc)
      const updatedMaster: CalendarEvent = {
        ...newMaster,
        summary: current.summary,
        description: current.description,
        location: current.location,
        reminders: current.reminders,
      }

      await updateAndSyncEvent(updatedMaster, newMaster, setCalendarEvents, requestSync)
    } catch (err) {
      reportError(err)
    }
  }

  const handleApplyToAll = async () => {
    if (!pendingEdit) return
    const { current, original } = pendingEdit
    if (!current.recurring_event_id) {
      closeDialog()
      return
    }
    closeDialog()

    try {
      const masterRpc = await rpc.caldir.get_event(
        original.calendar_slug,
        current.recurring_event_id,
      )
      if (!masterRpc) return
      const master = rpcToCalendarEvent(masterRpc)

      // Apply only the wall-clock time-of-day delta — the master's anchor
      // date stays put. Date moves on the instance are silently ignored
      // for the "all events" scope, matching Google Calendar's behavior.
      const { hour, minute } = wallclockTime(current.start)
      const newMasterStart = withWallclockTime(master.start, hour, minute)
      const durationMins = Math.round(
        (instantForOrdering(current.end).epochMilliseconds -
          instantForOrdering(current.start).epochMilliseconds) /
          60000,
      )
      const newMasterEnd = addMinutes(newMasterStart, durationMins)

      const updatedMaster: CalendarEvent = {
        ...master,
        summary: current.summary,
        description: current.description,
        location: current.location,
        start: newMasterStart,
        end: newMasterEnd,
        reminders: current.reminders,
        calendar_slug: current.calendar_slug,
      }

      await updateAndSyncEvent(updatedMaster, master, setCalendarEvents, requestSync)

      // When moving recurring events between calendar, cache gets stale -> reload!
      if (updatedMaster.calendar_slug !== master.calendar_slug) {
        await reloadEvents()
      }
    } catch (err) {
      reportError(err)
    }
  }

  return (
    <RecurrenceEditContext.Provider value={{ requestSave }}>
      {children}
      <RecurrenceConfirmDialog
        isOpen={pendingEdit !== null}
        onClose={closeDialog}
        onApplyToThis={handleApplyToThis}
        onApplyToFuture={handleApplyToFuture}
        onApplyToAll={handleApplyToAll}
      />
    </RecurrenceEditContext.Provider>
  )
}
