import { describe, expect, it } from "vitest"

import { rpcToCalendarEvent } from "@/lib/cal-events"

import { toAppEvent, toPluginEvents } from "./events"

function event(id: string, start: string, end: string) {
  return rpcToCalendarEvent({
    id,
    recurring_event_id: null,
    summary: id,
    description: null,
    location: null,
    url: null,
    start: { kind: "date", date: start },
    end: { kind: "date", date: end },
    status: "confirmed",
    recurrence: null,
    master_recurrence: null,
    reminders: [],
    organizer: null,
    attendees: [],
    conference: null,
    calendar_slug: "work",
    color: "#ff0000",
    updated: null,
  })
}

describe("toPluginEvents", () => {
  const later = event("later", "2026-09-20", "2026-09-21")
  const trip = event("trip", "2026-09-15", "2026-09-18")

  it("returns curated events in start order", () => {
    const [first, second] = toPluginEvents([later, trip])

    expect(first).toEqual({
      key: "work::trip",
      calendarId: "work",
      summary: "trip",
      description: null,
      location: null,
      url: null,
      start: trip.start,
      end: trip.end,
      firstDay: expect.objectContaining({ year: 2026, month: 9, day: 15 }),
      lastDay: expect.objectContaining({ year: 2026, month: 9, day: 17 }),
    })
    expect(second.key).toBe("work::later")
  })

  it("keeps each event's identity and maps it back to the app event", () => {
    const [pluginEvent] = toPluginEvents([trip])

    expect(toPluginEvents([trip])[0]).toBe(pluginEvent)
    expect(toAppEvent(pluginEvent)).toBe(trip)
  })

  it("rejects events the host didn't hand out", () => {
    const [pluginEvent] = toPluginEvents([trip])

    expect(() => toAppEvent({ ...pluginEvent })).toThrow()
  })
})
