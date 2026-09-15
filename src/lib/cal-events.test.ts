import { describe, expect, it } from "vitest"

import type { CalendarEvent as RpcCalendarEvent, RpcRecurrence } from "@/rpc/bindings"

import {
  reconcileOptimisticCreate,
  recurrenceToRpc,
  rollbackOptimisticCreate,
  rpcToCalendarEvent,
  rpcToRecurrence,
} from "./cal-events"

function event(id: string, summary: string, calendarSlug = "calendar") {
  const rpcEvent: RpcCalendarEvent = {
    id,
    recurring_event_id: null,
    summary,
    description: null,
    location: null,
    url: null,
    start: { kind: "date", date: "2026-09-15" },
    end: { kind: "date", date: "2026-09-16" },
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
  return rpcToCalendarEvent(rpcEvent)
}

describe("recurrence RPC conversion", () => {
  it("round-trips RDATEs without changing their event-time variants", () => {
    const recurrence: RpcRecurrence = {
      rrule: "FREQ=WEEKLY;BYDAY=MO",
      exdates: [{ kind: "date", date: "2026-09-21" }],
      rdates: [
        { kind: "date", date: "2026-09-22" },
        {
          kind: "datetime_zoned",
          wallclock: "2026-09-29T09:30:00",
          tzid: "Europe/London",
        },
      ],
    }

    expect(recurrenceToRpc(rpcToRecurrence(recurrence))).toEqual(recurrence)
  })
})

describe("optimistic event creation", () => {
  it("replaces the optimistic row with the created event", () => {
    const existing = event("existing", "Existing")
    const optimistic = event("optimistic", "Draft")
    const created = event("created", "Created")

    expect(reconcileOptimisticCreate([existing, optimistic], optimistic, created)).toEqual([
      existing,
      created,
    ])
  })

  it("appends the created event when a concurrent reload removed the optimistic row", () => {
    const reloaded = event("existing", "Reloaded")
    const optimistic = event("optimistic", "Draft")
    const created = event("created", "Created")

    expect(reconcileOptimisticCreate([reloaded], optimistic, created)).toEqual([reloaded, created])
  })

  it("does not duplicate an event already fetched by a concurrent reload", () => {
    const optimistic = event("optimistic", "Draft")
    const created = event("created", "Created")
    const events = [created]

    expect(reconcileOptimisticCreate(events, optimistic, created)).toBe(events)
  })

  it("removes the optimistic row after a failed create", () => {
    const existing = event("existing", "Existing")
    const optimistic = event("optimistic", "Draft")

    expect(rollbackOptimisticCreate([existing, optimistic], optimistic)).toEqual([existing])
  })
})
