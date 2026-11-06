/*
 * Saving an edit. A plain event saves at once; an occurrence of a series first
 * asks whether the edit is for it alone, the ones after it, or the whole series
 * (`RecurrenceEditDialog` reads `pendingEdit`).
 */
import { signal, untracked } from "nsh"

import { getErrorMessage } from "@/lib/api"
import { getStoredEvent, splitRecurringSeriesAt } from "@/lib/api/internal"
import { type CalendarEvent, eventKey, withDates } from "@/lib/cal-events"
import { addDays } from "@/lib/event-time"
import { anchorRangeToRecurringMaster } from "@/lib/recurrence-edit"
import { daysToFirstOccurrence } from "@/lib/rrule-utils"
import { updateAndSyncEvent } from "@/lib/save-event"
import { toast } from "@/lib/toast"

import { calendarEvents, reloadEvents, setCalendarEvents } from "@/stores/events"
import { requestSync } from "@/stores/sync"

export type PendingEdit = { current: CalendarEvent; original: CalendarEvent }

const pending = signal<PendingEdit | null>(null)

export const pendingEdit = () => pending()
export const closeEditDialog = () => pending.set(null)

/** The repeat field of an occurrence edits its copy of the series rule. */
export const isRuleChanged = ({ current, original }: PendingEdit) =>
  JSON.stringify(current.master_recurrence) !== JSON.stringify(original.master_recurrence)

const save = (current: CalendarEvent, original: CalendarEvent) =>
  updateAndSyncEvent(current, original, setCalendarEvents, requestSync)

/** Saves `current`, asking first for an occurrence of a series. */
export function requestSave(current: CalendarEvent, original: CalendarEvent) {
  // Deleted while the form was open: nothing left to save to.
  const key = eventKey(original)
  if (!untracked(calendarEvents).some((event) => eventKey(event) === key)) return

  if (current.recurring_event_id !== null) {
    pending.set({ current, original })
    return
  }
  void save(current, original)
}

function reportError(error: unknown) {
  toast.error("Failed to save event", {
    description: getErrorMessage(error, "Failed to save event"),
  })
  console.error("recurring update failed:", error)
}

export async function applyToThis() {
  const edit = untracked(pending)
  if (!edit) return
  closeEditDialog()
  // The backend detects synthetic instance ids and creates an override file
  // inheriting the master's metadata.
  await save(edit.current, edit.original)
}

export async function applyToFuture() {
  const edit = untracked(pending)
  closeEditDialog()
  const masterUid = edit?.current.recurring_event_id
  if (!edit || !masterUid) return
  const { current } = edit

  try {
    // A null rule is fine here: the split-off part becomes a single event.
    const newMaster = await splitRecurringSeriesAt({
      calendar_slug: current.calendar_slug,
      master_uid: masterUid,
      split_start: current.start,
      split_end: current.end,
      new_recurrence: current.master_recurrence,
    })

    // The split happens at this occurrence; if its day isn't in the new rule,
    // the new series starts on the rule's first day after it.
    const shift = current.master_recurrence
      ? daysToFirstOccurrence(newMaster.start, current.master_recurrence.rrule)
      : 0

    const updatedMaster: CalendarEvent = {
      ...withDates(newMaster, addDays(newMaster.start, shift), addDays(newMaster.end, shift)),
      summary: current.summary,
      description: current.description,
      location: current.location,
      url: current.url,
      reminders: current.reminders,
      conference: current.conference,
      color: current.color,
    }

    await save(updatedMaster, newMaster)
  } catch (error) {
    reportError(error)
  }
}

export async function applyToAll() {
  const edit = untracked(pending)
  closeEditDialog()
  const masterUid = edit?.current.recurring_event_id
  if (!edit || !masterUid) return
  const { current, original } = edit

  try {
    const master = await getStoredEvent({
      calendar_slug: original.calendar_slug,
      id: masterUid,
    })
    if (!master) return

    // The occurrence's edited range on the master's anchor date, which also
    // keeps date-only values when toggling the series all-day.
    let { start, end } = anchorRangeToRecurringMaster(current, master.start)

    // A new rule replaces the old one but keeps its exceptions, and the series
    // start moves onto the new rule's first day if needed.
    let recurrence = master.recurrence
    if (isRuleChanged(edit)) {
      recurrence = current.master_recurrence && {
        ...current.master_recurrence,
        exdates: master.recurrence?.exdates ?? [],
        rdates: master.recurrence?.rdates ?? [],
      }
      if (recurrence) {
        const shift = daysToFirstOccurrence(start, recurrence.rrule)
        start = addDays(start, shift)
        end = addDays(end, shift)
      }
    }

    const updatedMaster: CalendarEvent = {
      ...master,
      summary: current.summary,
      description: current.description,
      location: current.location,
      url: current.url,
      start,
      end,
      recurrence,
      reminders: current.reminders,
      conference: current.conference,
      color: current.color,
      calendar_slug: current.calendar_slug,
    }

    await save(updatedMaster, master)

    // A series moved between calendars leaves its occurrences stale.
    if (updatedMaster.calendar_slug !== master.calendar_slug) await reloadEvents()
  } catch (error) {
    reportError(error)
  }
}
