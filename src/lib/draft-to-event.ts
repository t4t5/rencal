import type { CalendarEvent } from "@/rpc/bindings"

import { formatEventTime } from "@/lib/time"

interface DraftEvent {
  summary: string
  description: string | null
  allDay: boolean
  start: Date
  end: Date
  calendarId: string | null
  location: string | null
  recurrence: { rrule: string; exdates: string[] } | null
}

export function draftToCalendarEvent(draft: DraftEvent): CalendarEvent {
  return {
    id: "",
    recurring_event_id: null,
    summary: draft.summary,
    description: draft.description,
    location: draft.location,
    start: formatEventTime(draft.start, draft.allDay),
    end: formatEventTime(draft.end, draft.allDay),
    all_day: draft.allDay,
    status: "confirmed",
    recurrence: draft.recurrence,
    master_recurrence: null,
    reminders: [],
    organizer: null,
    attendees: [],
    conference_url: null,
    calendar_slug: draft.calendarId ?? "",
    color: null,
  }
}
