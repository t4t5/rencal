import { Temporal } from "@js-temporal/polyfill"
import { describe, expect, it } from "vitest"

import type { CalendarEvent } from "@/lib/cal-events"
import {
  computeEventDateInfo,
  fromDate,
  getViewerTzid,
  setViewerTzid,
  toViewerZonedDateTime,
} from "@/lib/event-time"
import { isSpanning } from "@/lib/event-utils"

import { getLastEventEndTime } from "./active-day-draft"

function eventBetween(startDate: Date, endDate: Date): CalendarEvent {
  const start = fromDate(startDate)
  const end = fromDate(endDate)
  return {
    id: "event",
    recurring_event_id: null,
    summary: "Late event",
    description: null,
    location: null,
    start,
    end,
    status: "confirmed",
    recurrence: null,
    master_recurrence: null,
    reminders: [],
    organizer: null,
    attendees: [],
    conference: null,
    calendar_slug: "calendar",
    color: null,
    updated: null,
    dateInfo: computeEventDateInfo(start, end),
  }
}

describe("getLastEventEndTime", () => {
  it("falls back to 08:00 on the selected day when the last event ends at midnight", () => {
    const selectedDay = Temporal.PlainDate.from("2025-07-18")
    const event = eventBetween(new Date(2025, 6, 18, 22), new Date(2025, 6, 19, 0))

    const suggestedStart = getLastEventEndTime(selectedDay, [event])
    expect(suggestedStart).not.toBeNull()

    const wallclock = toViewerZonedDateTime(suggestedStart!)
    expect([
      wallclock.year,
      wallclock.month,
      wallclock.day,
      wallclock.hour,
      wallclock.minute,
    ]).toEqual([2025, 7, 18, 8, 0])
  })

  it("recognizes a timed event spanning the spring-forward boundary", () => {
    const originalViewerTz = getViewerTzid()
    try {
      setViewerTzid("Europe/London")
      const event = eventBetween(new Date(2026, 2, 28, 22), new Date(2026, 2, 29, 2))
      expect(isSpanning(event)).toBe(true)
    } finally {
      setViewerTzid(originalViewerTz)
    }
  })
})
