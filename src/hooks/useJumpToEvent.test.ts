import { Temporal } from "@js-temporal/polyfill"
import { describe, expect, it } from "vitest"

import type { CalendarEvent } from "@/lib/cal-events"
import { upsertEvent } from "@/lib/upsert-event"

function event(id: string, calendarSlug = "calendar"): CalendarEvent {
  return {
    id,
    recurring_event_id: null,
    summary: id,
    description: null,
    location: null,
    start: { kind: "date", value: Temporal.PlainDate.from("2026-08-26") },
    end: { kind: "date", value: Temporal.PlainDate.from("2026-08-27") },
    dateInfo: {
      startMs: 0,
      firstDay: 0,
      lastDay: 0,
      endDay: 1,
      startLocalMinutes: 0,
      endLocalMinutes: 0,
    },
    status: "confirmed",
    recurrence: null,
    master_recurrence: null,
    reminders: [],
    organizer: null,
    attendees: [],
    conference: null,
    calendar_slug: calendarSlug,
    color: null,
    updated: null,
  }
}

describe("upsertEvent", () => {
  it("adds a missing event by eventKey", () => {
    const existing = event("same", "one")
    const target = event("same", "two")
    expect(upsertEvent([existing], target)).toEqual([existing, target])
  })

  it("does not duplicate an already loaded event", () => {
    const target = event("same")
    const events = [target]
    expect(upsertEvent(events, target)).toBe(events)
  })
})
