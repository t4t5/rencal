import type { Dispatch, SetStateAction } from "react"
import { toast } from "sonner"

import { updateEvent } from "@/lib/api/calendar-events"
import { getErrorMessage } from "@/lib/api/errors"
import { eventKey, type CalendarEvent } from "@/lib/cal-events"

export type RequestSync = () => Promise<void>
export type SetCalendarEvents = Dispatch<SetStateAction<CalendarEvent[]>>

export async function updateAndSyncEvent(
  current: CalendarEvent,
  original: CalendarEvent,
  setCalendarEvents: SetCalendarEvents,
  requestSync: RequestSync,
): Promise<void> {
  // Match on the original identity: an edit may move the event to a different
  // calendar (new_calendar_slug), changing its eventKey from under us.
  setCalendarEvents((prev) => prev.map((e) => (eventKey(e) === eventKey(original) ? current : e)))

  try {
    await updateEvent({
      id: current.id,
      calendar_slug: original.calendar_slug,
      new_calendar_slug:
        current.calendar_slug !== original.calendar_slug ? current.calendar_slug : null,
      summary: current.summary,
      description: current.description,
      location: current.location,
      url: current.url,
      start: current.start,
      end: current.end,
      recurrence: current.recurrence,
      reminders: current.reminders,
      attendees: current.attendees,
      conference: current.conference,
    })
    await requestSync()
  } catch (err) {
    // Roll back: the optimistic pass replaced the row with `current`, so find it
    // by `current`'s key and restore the original.
    setCalendarEvents((prev) => prev.map((e) => (eventKey(e) === eventKey(current) ? original : e)))
    const message = getErrorMessage(err, "Failed to save event")
    toast.error("Failed to save event", { description: message })
    console.error("update_event failed:", err)
  }
}
