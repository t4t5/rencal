import { Temporal } from "@js-temporal/polyfill"
import { describe, expect, it } from "vitest"

import type { Calendar } from "@/lib/api"

import type { CalendarEvent } from "./cal-events"
import { atTime, computeEventDateInfo, type EventTime } from "./event-time"
import { fromRpcEventTime } from "./event-time/rpc"
import { getUserResponseStatus, isSpanning, isUserOrganizer } from "./event-utils"

const date = (value: string): EventTime => fromRpcEventTime({ kind: "date", date: value })

// Infomaniak-style CalDAV login that differs from the invitee address (#157).
const calendar: Calendar = {
  slug: "work",
  name: null,
  color: null,
  provider: "caldav",
  account: "AB12345@sync.infomaniak.com",
  email: "first.last@company.ch",
  read_only: false,
}

function invite(start = date("2026-10-13"), end = date("2026-10-13")): CalendarEvent {
  return {
    id: "invite",
    recurring_event_id: null,
    summary: "Invite",
    description: null,
    location: null,
    url: null,
    start,
    end,
    status: "confirmed",
    availability: "busy",
    recurrence: null,
    master_recurrence: null,
    reminders: [],
    organizer: { name: null, email: "organizer@example.com", response_status: null },
    attendees: [
      { name: null, email: "organizer@example.com", response_status: "accepted" },
      { name: null, email: "First.Last@company.ch", response_status: "needs-action" },
    ],
    conference: null,
    calendar_slug: "work",
    color: null,
    updated: null,
    dateInfo: computeEventDateInfo(start, end),
  }
}

describe("invitee matching", () => {
  it("matches attendees by calendar email rather than account login", () => {
    expect(getUserResponseStatus(invite(), [calendar])).toBe("needs-action")
  })

  it("treats invites to the calendar email as not organized by the user", () => {
    expect(isUserOrganizer(invite(), [calendar])).toBe(false)
  })
})

describe("isSpanning", () => {
  const at = (day: string, hour: number, minute = 0) =>
    atTime(Temporal.PlainDate.from(day), hour, minute)
  const spanning = (start: EventTime, end: EventTime) => isSpanning(invite(start, end))

  it("spans all-day events", () => {
    expect(spanning(date("2026-10-13"), date("2026-10-14"))).toBe(true)
  })

  it("keeps timed events within a day, or crossing midnight only, at their times", () => {
    expect(spanning(at("2026-10-13", 9), at("2026-10-13", 10))).toBe(false)
    expect(spanning(at("2026-10-13", 0), at("2026-10-14", 0))).toBe(false)
    expect(spanning(at("2026-10-13", 22), at("2026-10-14", 0))).toBe(false)
    expect(spanning(at("2026-10-13", 23), at("2026-10-14", 1))).toBe(false)
    expect(spanning(at("2026-10-13", 12), at("2026-10-14", 13))).toBe(false)
  })

  it("spans timed events covering a whole day", () => {
    expect(spanning(at("2026-10-13", 0), at("2026-10-14", 1))).toBe(true)
    expect(spanning(at("2026-10-13", 12), at("2026-10-15", 0))).toBe(true)
    expect(spanning(at("2026-10-13", 12), at("2026-10-16", 14))).toBe(true)
  })
})
