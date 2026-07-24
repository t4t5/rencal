import type { DraftEvent } from "@/contexts/EventDraftContext"

import type { CalendarEvent } from "@/lib/cal-events"
import { computeEventDateInfo } from "@/lib/event-time"

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
    attendees: draft.attendees,
    conference: draft.conference,
    calendar_slug: draft.calendarId,
    color: null,
    updated: null,
  }
}
