import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { CalendarEvent } from "./cal-events"
import { computeEventDateInfo, formatDateKey, type EventTime } from "./event-time"
import { fromRpcEventTime } from "./event-time/rpc"
import { withNearestOccurrence } from "./rrule-utils"

const date = (value: string): EventTime => fromRpcEventTime({ kind: "date", date: value })

function recurringEvent({
  rrule = "FREQ=WEEKLY;BYDAY=MO",
  exdates = [],
  startDate = "2020-06-01",
}: {
  rrule?: string
  exdates?: EventTime[]
  startDate?: string
} = {}): CalendarEvent {
  const start = date(startDate)
  const end = date(start.value.add({ days: 1 }).toString())

  return {
    id: "weekly-event",
    recurring_event_id: null,
    summary: "Weekly event",
    description: null,
    location: null,
    start,
    end,
    status: "confirmed",
    recurrence: { rrule, exdates },
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

describe("withNearestOccurrence", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 6, 31, 12))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("shifts a recurring master to its next occurrence", () => {
    const shifted = withNearestOccurrence(recurringEvent())

    expect(formatDateKey(shifted.start)).toBe("2026-08-03")
    expect(formatDateKey(shifted.end)).toBe("2026-08-04")
  })

  it("keeps the DTSTART weekday when BYDAY is omitted across DST", () => {
    const winterNow = new Date(2026, 0, 30, 12)
    const shifted = withNearestOccurrence(recurringEvent({ rrule: "FREQ=WEEKLY" }), winterNow)

    expect(formatDateKey(shifted.start)).toBe("2026-02-02")
    expect(formatDateKey(shifted.end)).toBe("2026-02-03")
  })

  it("skips excluded occurrences", () => {
    const shifted = withNearestOccurrence(recurringEvent({ exdates: [date("2026-08-03")] }))

    expect(formatDateKey(shifted.start)).toBe("2026-08-10")
    expect(formatDateKey(shifted.end)).toBe("2026-08-11")
  })

  it("uses the last occurrence when a finite series has ended", () => {
    const shifted = withNearestOccurrence(recurringEvent({ rrule: "FREQ=WEEKLY;COUNT=3" }))

    expect(formatDateKey(shifted.start)).toBe("2020-06-15")
    expect(formatDateKey(shifted.end)).toBe("2020-06-16")
  })

  it("returns the master unchanged when its rule cannot be parsed", () => {
    const event = recurringEvent({ rrule: "not-an-rrule" })

    expect(withNearestOccurrence(event)).toBe(event)
  })

  it("passes non-recurring events through unchanged", () => {
    const event = { ...recurringEvent(), recurrence: null }

    expect(withNearestOccurrence(event)).toBe(event)
  })
})
