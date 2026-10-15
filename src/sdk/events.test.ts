import { Temporal } from "@js-temporal/polyfill"
import { describe, expect, it } from "vitest"

import { rpcToCalendarEvent } from "@/lib/cal-events"

import { eventsByDay, toAppEvent, toPluginEvents } from "./events"

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

describe("eventsByDay", () => {
  const date = (value: string) => Temporal.PlainDate.from(value)
  const [trip, later] = toPluginEvents([
    event("trip", "2026-09-15", "2026-09-18"),
    event("later", "2026-09-20", "2026-09-21"),
  ])

  it("lists every day in the range with the events covering it", () => {
    const days = eventsByDay([trip, later], date("2026-09-16"), date("2026-09-21"))

    expect(days.map((day) => [day.date.toString(), day.events.map((e) => e.summary)])).toEqual([
      ["2026-09-16", ["trip"]],
      ["2026-09-17", ["trip"]],
      ["2026-09-18", []],
      ["2026-09-19", []],
      ["2026-09-20", ["later"]],
    ])
  })

  it("returns nothing for an empty range", () => {
    expect(eventsByDay([trip], date("2026-09-16"), date("2026-09-16"))).toEqual([])
  })
})
