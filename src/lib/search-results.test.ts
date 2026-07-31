import { describe, expect, it } from "vitest"

import type { CalendarEvent, Recurrence } from "./cal-events"
import { computeEventDateInfo, type EventTime } from "./event-time"
import { fromRpcEventTime } from "./event-time/rpc"
import { prepareSearchResults } from "./search-results"

const date = (value: string): EventTime => fromRpcEventTime({ kind: "date", date: value })

function event(id: string, startDate: string, recurrence: Recurrence | null = null): CalendarEvent {
  const start = date(startDate)
  const end = date(startDate)

  return {
    id,
    recurring_event_id: null,
    summary: id,
    description: null,
    location: null,
    start,
    end,
    status: "confirmed",
    recurrence,
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

describe("prepareSearchResults", () => {
  it("ranks a recurring event by its displayed occurrence instead of its master start", () => {
    const results = prepareSearchResults(
      [
        event("2015 event", "2015-08-06"),
        event("2013 event", "2013-12-05"),
        event("recurring event", "2010-05-14", {
          rrule: "FREQ=YEARLY;BYMONTH=5;BYMONTHDAY=14",
          exdates: [],
        }),
      ],
      new Date(2026, 6, 31, 12),
    )

    expect(results.map(({ id }) => id)).toEqual(["recurring event", "2015 event", "2013 event"])
  })
})
