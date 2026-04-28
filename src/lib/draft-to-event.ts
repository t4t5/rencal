import type { CalendarEvent, Recurrence } from "@/lib/cal-events"
import { computeEventDateInfo, type EventTime } from "@/lib/event-time"

interface DraftEvent {
  summary: string
  description: string | null
  start: EventTime
  end: EventTime
  calendarId: string | null
  location: string | null
  recurrence: Recurrence | null
}

export function draftToCalendarEvent(draft: DraftEvent): CalendarEvent | null {
  if (draft.calendarId == null) return null
  return {
    id: "",
    recurring_event_id: null,
    summary: draft.summary,
    description: draft.description,
    location: draft.location,
    start: draft.start,
    end: draft.end,
    dateInfo: computeEventDateInfo(draft.start, draft.end),
    status: "confirmed",
    recurrence: draft.recurrence,
    master_recurrence: null,
    reminders: [],
    organizer: null,
    attendees: [],
    conference_url: null,
    calendar_slug: draft.calendarId,
    color: null,
    updated: null,
  }
}
