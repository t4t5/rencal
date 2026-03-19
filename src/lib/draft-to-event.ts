import { format } from "date-fns"

import type { CalendarEvent } from "@/rpc/bindings"

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
    start: draft.allDay ? format(draft.start, "yyyy-MM-dd") : draft.start.toISOString(),
    end: draft.allDay ? format(draft.end, "yyyy-MM-dd") : draft.end.toISOString(),
    all_day: draft.allDay,
    status: "confirmed",
    recurrence: draft.recurrence,
    master_recurrence: null,
    reminders: [],
    organizer: null,
    attendees: [],
    conference_url: null,
    calendar_slug: draft.calendarId ?? "",
  }
}
