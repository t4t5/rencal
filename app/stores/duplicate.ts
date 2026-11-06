/*
 * Duplicating an event opens the new-event popover with a copy, so saving goes
 * through the normal create path and the copy gets a fresh UID. Series ask first.
 */
import { signal, untracked } from "nsh"

import { getStoredEvent } from "@/lib/api/internal"
import type { CalendarEvent, Recurrence } from "@/lib/cal-events"
import { conferenceForCalendar } from "@/lib/conference"
import { eventColorForCalendar } from "@/lib/event-colors"
import { isEventReadonly } from "@/lib/event-utils"

import { calendars } from "@/stores/calendar"
import { canCreate, defaultCalendarId, openDraftPopover, promptToConnect } from "@/stores/draft"

const pending = signal<CalendarEvent | null>(null)

export const pendingDuplicate = () => pending()
export const closeDuplicateDialog = () => pending.set(null)

function openDuplicateDraft(source: CalendarEvent, recurrence: Recurrence | null) {
  const list = untracked(calendars)
  const targetSlug = list.some((c) => c.slug === source.calendar_slug && !c.read_only)
    ? source.calendar_slug
    : untracked(defaultCalendarId)
  if (!targetSlug) {
    promptToConnect()
    return
  }
  const targetCalendar = list.find((c) => c.slug === targetSlug)

  openDraftPopover(
    {
      summary: source.summary,
      description: source.description,
      start: source.start,
      end: source.end,
      calendarId: targetSlug,
      location: source.location,
      url: source.url,
      recurrence,
      attendees: [...source.attendees],
      conference: conferenceForCalendar(source.conference, targetCalendar),
      color: eventColorForCalendar(source.color, targetCalendar),
    },
    [...source.reminders],
  )
}

/** Plain events open the draft directly; series ask which occurrences to copy. */
export function triggerDuplicate(event: CalendarEvent) {
  if (isEventReadonly(event, untracked(calendars))) return
  if (!untracked(canCreate)) {
    promptToConnect()
    return
  }
  if (event.recurring_event_id || event.recurrence) {
    pending.set(event)
    return
  }
  openDuplicateDraft(event, null)
}

export function duplicateThis() {
  const event = untracked(pending)
  if (!event) return
  closeDuplicateDialog()
  // A single occurrence becomes a standalone event.
  openDuplicateDraft(event, null)
}

export function duplicateFuture() {
  const event = untracked(pending)
  if (!event) return
  closeDuplicateDialog()
  // A new series anchored at this occurrence; the original is left untouched.
  openDuplicateDraft(event, event.master_recurrence ?? event.recurrence)
}

export async function duplicateAll() {
  const event = untracked(pending)
  if (!event) return
  closeDuplicateDialog()
  // From the master, so the anchor date and rule stay intact.
  if (event.recurring_event_id) {
    try {
      const master = await getStoredEvent({
        calendar_slug: event.calendar_slug,
        id: event.recurring_event_id,
      })
      if (master) {
        openDuplicateDraft(
          master,
          master.recurrence ?? master.master_recurrence ?? event.master_recurrence,
        )
        return
      }
    } catch (error) {
      console.error("get_event (duplicate master) failed:", error)
    }
  }
  openDuplicateDraft(event, event.recurrence ?? event.master_recurrence)
}
