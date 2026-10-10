import { useState, type ReactNode } from "react"
import { toast } from "sonner"

import { RecurrenceConfirmDialog } from "@/components/event-parts/RecurrenceConfirmDialog"

import { useCalEvents } from "@/contexts/CalEventsContext"
import { useCalendars } from "@/contexts/CalendarStateContext"
import { useSync } from "@/contexts/SyncContext"

import { getErrorMessage } from "@/lib/api"
import { getStoredEvent, splitRecurringSeriesAt } from "@/lib/api/internal"
import type { CalendarEvent } from "@/lib/cal-events"
import { addDays } from "@/lib/event-time"
import { isUserOrganizer } from "@/lib/event-utils"
import { anchorRangeToRecurringMaster } from "@/lib/recurrence-edit"
import { daysToFirstOccurrence } from "@/lib/rrule-utils"
import { updateAndSyncEvent } from "@/lib/save-event"
import { createStrictContext } from "@/lib/strict-context"

type PendingEdit = { current: CalendarEvent; original: CalendarEvent }

// The repeat field of an occurrence edits its copy of the series rule.
const isRuleChanged = ({ current, original }: PendingEdit) =>
  JSON.stringify(current.master_recurrence) !== JSON.stringify(original.master_recurrence)

interface RecurrenceEditContextValue {
  // Non-recurring events save directly.
  // Recurring events show a dialog ("Only this event", "All future events"...)
  requestSave: (current: CalendarEvent, original: CalendarEvent) => void
}

const [RecurrenceEditContextProvider, useRecurrenceEdit] =
  createStrictContext<RecurrenceEditContextValue>("RecurrenceEdit")

export { useRecurrenceEdit }

export function RecurrenceEditProvider({ children }: { children: ReactNode }) {
  const { setCalendarEvents, reloadEvents } = useCalEvents()
  const { calendars } = useCalendars()
  const { requestSync } = useSync()
  const [pendingEdit, setPendingEdit] = useState<PendingEdit | null>(null)
  const [shownEdit, setShownEdit] = useState(pendingEdit)
  if (pendingEdit && pendingEdit !== shownEdit) setShownEdit(pendingEdit)

  const requestSave = (current: CalendarEvent, original: CalendarEvent) => {
    if (current.recurring_event_id !== null) {
      setPendingEdit({ current, original })
      return
    }
    void updateAndSyncEvent(current, original, setCalendarEvents, requestSync)
  }

  const closeDialog = () => setPendingEdit(null)

  const reportError = (err: unknown) => {
    const message = getErrorMessage(err, "Failed to save event")
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
    // A null rule is fine here: the split-off part becomes a single event.
    if (!current.recurring_event_id) {
      closeDialog()
      return
    }
    closeDialog()

    try {
      const newMaster = await splitRecurringSeriesAt({
        calendar_slug: current.calendar_slug,
        master_uid: current.recurring_event_id,
        split_start: current.start,
        split_end: current.end,
        new_recurrence: current.master_recurrence,
      })

      const updatedMaster: CalendarEvent = {
        ...newMaster,
        summary: current.summary,
        description: current.description,
        location: current.location,
        url: current.url,
        reminders: current.reminders,
        conference: current.conference,
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
      const master = await getStoredEvent({
        calendar_slug: original.calendar_slug,
        id: current.recurring_event_id,
      })
      if (!master) return

      // Apply the occurrence's edited range while retaining the master's anchor
      // date. This also preserves date-only values when toggling the series all-day.
      let { start: newMasterStart, end: newMasterEnd } = anchorRangeToRecurringMaster(
        current,
        master.start,
      )

      // A new rule replaces the old one but keeps its exceptions, and the
      // series start moves onto the new rule's first day if needed.
      let recurrence = master.recurrence
      if (isRuleChanged(pendingEdit)) {
        recurrence = current.master_recurrence && {
          ...current.master_recurrence,
          exdates: master.recurrence?.exdates ?? [],
          rdates: master.recurrence?.rdates ?? [],
        }
        if (recurrence) {
          const shift = daysToFirstOccurrence(newMasterStart, recurrence.rrule)
          newMasterStart = addDays(newMasterStart, shift)
          newMasterEnd = addDays(newMasterEnd, shift)
        }
      }

      const updatedMaster: CalendarEvent = {
        ...master,
        summary: current.summary,
        description: current.description,
        location: current.location,
        url: current.url,
        start: newMasterStart,
        end: newMasterEnd,
        recurrence,
        reminders: current.reminders,
        conference: current.conference,
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
    <RecurrenceEditContextProvider value={{ requestSave }}>
      {children}
      <RecurrenceConfirmDialog
        isOpen={pendingEdit !== null}
        // A changed rule belongs to the series, not to a single occurrence.
        canApplyToThis={!shownEdit || !isRuleChanged(shownEdit)}
        // Only the organizer can split a recurring series.
        canApplyToFuture={shownEdit ? isUserOrganizer(shownEdit.current, calendars) : true}
        onClose={closeDialog}
        onApplyToThis={handleApplyToThis}
        onApplyToFuture={handleApplyToFuture}
        onApplyToAll={handleApplyToAll}
      />
    </RecurrenceEditContextProvider>
  )
}
