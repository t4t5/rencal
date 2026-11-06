/*
 * Deleting an event: `triggerDelete` asks, then removes it at once and puts it
 * back if the backend refuses. `DeleteConfirmDialog` reads `deleteTarget`.
 */
import { signal, untracked } from "nsh"

import { api, getErrorMessage } from "@/lib/api"
import { deleteRecurringSeries, getStoredEvent, splitRecurringSeriesAt } from "@/lib/api/internal"
import { type CalendarEvent, eventKey } from "@/lib/cal-events"
import { toast } from "@/lib/toast"

import { setActiveEventKey, setCalendarEvents } from "@/stores/events"
import { requestSync } from "@/stores/sync"

const target = signal<CalendarEvent | null>(null)

export const deleteTarget = () => target()
export const closeDeleteDialog = () => target.set(null)

/** Plain events get a confirmation; series ask which occurrences to delete. */
export function triggerDelete(event: CalendarEvent) {
  // One confirmation at a time: a trigger while it's open must not retarget it.
  target.update((pending) => pending ?? event)
}

function reportError(procedure: string, error: unknown) {
  toast.error("Failed to delete event", {
    description: getErrorMessage(error, "Failed to delete event"),
  })
  console.error(`${procedure} failed:`, error)
}

/** Drops matching events right away; returns how to put them back. */
function removeOptimistically(matches: (event: CalendarEvent) => boolean) {
  let removed: CalendarEvent[] = []
  setCalendarEvents((events) => {
    removed = events.filter(matches)
    return events.filter((event) => !matches(event))
  })
  closeDeleteDialog()
  setActiveEventKey(null)
  return () => setCalendarEvents((events) => [...events, ...removed])
}

export async function deleteThis() {
  const event = untracked(target)
  if (!event) return
  const restore = removeOptimistically((other) => eventKey(other) === eventKey(event))

  try {
    await api.events.delete(event)
    void requestSync()
  } catch (error) {
    restore()
    reportError("delete_event", error)
  }
}

export async function deleteAll() {
  const event = untracked(target)
  if (!event) return
  const parentId = event.recurring_event_id ?? event.id
  const calendarSlug = event.calendar_slug

  // Scoped to the calendar, so an identical series in another one isn't dropped.
  const restore = removeOptimistically(
    (other) =>
      other.calendar_slug === calendarSlug &&
      (other.id === parentId || other.recurring_event_id === parentId),
  )

  try {
    await deleteRecurringSeries(calendarSlug, parentId)
    void requestSync()
  } catch (error) {
    restore()
    reportError("delete_recurring_series", error)
  }
}

export async function deleteFuture() {
  const event = untracked(target)
  if (!event) return
  const masterUid = event.recurring_event_id
  const calendarSlug = event.calendar_slug

  // From the series master, "this and future" is the whole series.
  if (!masterUid) return deleteAll()

  // Same from the first occurrence: truncating before it would leave an empty
  // ghost master.
  try {
    const master = await getStoredEvent({ calendar_slug: calendarSlug, id: masterUid })
    if (master && event.dateInfo.startMs <= master.dateInfo.startMs) return deleteAll()
  } catch {
    // Master unreadable: let the split surface the error.
  }

  const restore = removeOptimistically(
    (other) =>
      other.calendar_slug === calendarSlug &&
      (other.id === masterUid || other.recurring_event_id === masterUid) &&
      other.dateInfo.startMs >= event.dateInfo.startMs,
  )

  try {
    // There's no "delete from here": split the series at this occurrence, which
    // truncates the master and drops later overrides, then delete the new master.
    const newMaster = await splitRecurringSeriesAt({
      calendar_slug: calendarSlug,
      master_uid: masterUid,
      split_start: event.start,
      split_end: event.end,
      new_recurrence: null,
    })
    await api.events.delete(newMaster)
    void requestSync()
  } catch (error) {
    restore()
    reportError("delete future events", error)
  }
}
