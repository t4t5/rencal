import type { Dispatch, SetStateAction } from "react"
import { toast } from "sonner"

import { rpc } from "@/rpc"

import { recurrenceToRpc, type CalendarEvent } from "@/lib/cal-events"
import { toRpcEventTime } from "@/lib/event-time/rpc"

export type RequestSync = () => Promise<void>
export type SetCalendarEvents = Dispatch<SetStateAction<CalendarEvent[]>>

export async function updateAndSyncEvent(
  current: CalendarEvent,
  original: CalendarEvent,
  setCalendarEvents: SetCalendarEvents,
  requestSync: RequestSync,
): Promise<void> {
  setCalendarEvents((prev) => prev.map((e) => (e.id === current.id ? current : e)))

  try {
    await rpc.caldir.update_event({
      id: current.id,
      calendar_slug: original.calendar_slug,
      new_calendar_slug:
        current.calendar_slug !== original.calendar_slug ? current.calendar_slug : null,
      summary: current.summary,
      description: current.description,
      location: current.location,
      start: toRpcEventTime(current.start),
      end: toRpcEventTime(current.end),
      recurrence: current.recurrence ? recurrenceToRpc(current.recurrence) : null,
      reminders: current.reminders,
    })
    await requestSync()
  } catch (err) {
    setCalendarEvents((prev) => prev.map((e) => (e.id === original.id ? original : e)))
    const message = err instanceof Error ? err.message : String(err)
    toast.error("Failed to save event", { description: message })
    console.error("update_event failed:", err)
  }
}
