import { describe, expect, it } from "vitest"

import type { Calendar } from "@/lib/api"

import type { CalendarEvent } from "./cal-events"
import { computeEventDateInfo, type EventTime } from "./event-time"
import { fromRpcEventTime } from "./event-time/rpc"
import { getUserResponseStatus, isUserOrganizer } from "./event-utils"

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

function invite(): CalendarEvent {
  const start = date("2026-10-13")
  const end = date("2026-10-13")

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
