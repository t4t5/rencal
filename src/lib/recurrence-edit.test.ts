import { describe, expect, it } from "vitest"

import { type CalendarEvent, withDates } from "@/lib/cal-events"
import { computeEventDateInfo, type EventTimeRange } from "@/lib/event-time"
import { fromRpcEventTime, toRpcEventTime } from "@/lib/event-time/rpc"

import { anchorRangeToRecurringMaster, withPendingEdits } from "./recurrence-edit"

const zoned = (wallclock: string) =>
  fromRpcEventTime({ kind: "datetime_zoned", wallclock, tzid: "Europe/London" })
const date = (value: string) => fromRpcEventTime({ kind: "date", date: value })

describe("anchorRangeToRecurringMaster", () => {
  it("converts a timed recurring master to an all-day range", () => {
    const current: EventTimeRange = {
      start: date("2026-08-24"),
      end: date("2026-08-25"),
    }

    const result = anchorRangeToRecurringMaster(current, zoned("2021-08-24T09:00:00"))

    expect(toRpcEventTime(result.start)).toEqual({ kind: "date", date: "2021-08-24" })
    expect(toRpcEventTime(result.end)).toEqual({ kind: "date", date: "2021-08-25" })
  })

  it("keeps a timed edit timed while restoring the master's anchor date", () => {
    const current: EventTimeRange = {
      start: zoned("2026-08-24T10:30:00"),
      end: zoned("2026-08-24T11:30:00"),
    }

    const result = anchorRangeToRecurringMaster(current, zoned("2021-08-24T09:00:00"))

    expect(toRpcEventTime(result.start)).toEqual({
      kind: "datetime_zoned",
      wallclock: "2021-08-24T10:30:00",
      tzid: "Europe/London",
    })
    expect(toRpcEventTime(result.end)).toEqual({
      kind: "datetime_zoned",
      wallclock: "2021-08-24T11:30:00",
      tzid: "Europe/London",
    })
  })
})

describe("withPendingEdits", () => {
  const occurrence = (id: string, start: string, end: string): CalendarEvent => {
    const range = { start: zoned(start), end: zoned(end) }
    return {
      id,
      recurring_event_id: "standup",
      summary: "Standup",
      description: null,
      location: null,
      url: null,
      ...range,
      status: "confirmed",
      availability: "busy",
      recurrence: null,
      master_recurrence: null,
      reminders: [],
      organizer: null,
      attendees: [],
      conference: null,
      calendar_slug: "work",
      color: null,
      updated: null,
      dateInfo: computeEventDateInfo(range.start, range.end),
    }
  }

  const monday = occurrence("standup-mon", "2026-08-24T09:00:00", "2026-08-24T09:30:00")
  const tuesday = occurrence("standup-tue", "2026-08-25T09:00:00", "2026-08-25T09:30:00")
  const moved = (event: CalendarEvent, start: string, end: string) =>
    withDates(event, zoned(start), zoned(end))

  it("draws an edited occurrence at its new time and length", () => {
    const later = moved(tuesday, "2026-08-25T14:00:00", "2026-08-25T15:00:00")

    expect(withPendingEdits([monday, tuesday], [{ current: later, original: tuesday }])).toEqual([
      monday,
      later,
    ])
  })

  it("lets a later edit of the same occurrence win", () => {
    const first = moved(monday, "2026-08-24T10:00:00", "2026-08-24T10:30:00")
    const second = moved(monday, "2026-08-24T11:00:00", "2026-08-24T11:30:00")
    const edits = [
      { current: first, original: monday },
      { current: second, original: monday },
    ]

    expect(withPendingEdits([monday], edits)).toEqual([second])
  })

  it("finds an occurrence moved to another calendar by its original identity", () => {
    const elsewhere = { ...monday, calendar_slug: "home" }

    expect(withPendingEdits([monday], [{ current: elsewhere, original: monday }])).toEqual([
      elsewhere,
    ])
  })

  it("returns the same list when no edit matches", () => {
    const events = [monday]
    const edit = { current: tuesday, original: tuesday }

    expect(withPendingEdits(events, [])).toBe(events)
    expect(withPendingEdits(events, [edit])).toBe(events)
  })
})
