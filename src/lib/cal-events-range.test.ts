import { Temporal } from "@js-temporal/polyfill"
import { describe, expect, it } from "vitest"

import { rpcToCalendarEvent } from "@/lib/cal-events"

import { mergeEvents, subtractRanges, unionRanges } from "./cal-events-range"

const r = (start: string, end: string) => ({
  start: Temporal.PlainDate.from(start),
  end: Temporal.PlainDate.from(end),
})
const show = (ranges: { start: Temporal.PlainDate; end: Temporal.PlainDate }[]) =>
  ranges.map(({ start, end }) => `${start}..${end}`)

describe("unionRanges", () => {
  it("sorts, joins overlapping and touching ranges, and drops empty ones", () => {
    expect(
      show(
        unionRanges([
          r("2026-05-01", "2026-06-01"),
          r("2026-01-01", "2026-02-01"),
          r("2026-02-01", "2026-03-01"),
          r("2026-05-15", "2026-07-01"),
          r("2026-09-01", "2026-09-01"),
        ]),
      ),
    ).toEqual(["2026-01-01..2026-03-01", "2026-05-01..2026-07-01"])
  })

  it("keeps a range that another contains", () => {
    expect(
      show(unionRanges([r("2026-01-01", "2026-12-01"), r("2026-03-01", "2026-04-01")])),
    ).toEqual(["2026-01-01..2026-12-01"])
  })
})

describe("subtractRanges", () => {
  const covered = [r("2026-02-01", "2026-03-01"), r("2026-05-01", "2026-06-01")]

  it("returns the gaps around and between covered ranges", () => {
    expect(show(subtractRanges([r("2026-01-01", "2026-07-01")], covered))).toEqual([
      "2026-01-01..2026-02-01",
      "2026-03-01..2026-05-01",
      "2026-06-01..2026-07-01",
    ])
  })

  it("returns nothing for a covered range", () => {
    expect(subtractRanges([r("2026-02-10", "2026-02-20")], covered)).toEqual([])
  })

  it("trims partial overlaps and keeps disjoint ranges whole", () => {
    expect(
      show(subtractRanges([r("2026-02-15", "2026-04-01"), r("2027-01-01", "2027-02-01")], covered)),
    ).toEqual(["2026-03-01..2026-04-01", "2027-01-01..2027-02-01"])
  })

  it("returns everything when nothing is covered", () => {
    expect(show(subtractRanges([r("2026-01-01", "2026-02-01")], []))).toEqual([
      "2026-01-01..2026-02-01",
    ])
  })
})

describe("mergeEvents", () => {
  const event = (id: string, date: string) =>
    rpcToCalendarEvent({
      id,
      calendar_slug: "work",
      summary: id,
      start: { kind: "date", date },
      end: { kind: "date", date: Temporal.PlainDate.from(date).add({ days: 1 }).toString() },
      status: "confirmed",
      availability: "busy",
      recurring_event_id: null,
      description: null,
      location: null,
      url: null,
      recurrence: null,
      master_recurrence: null,
      reminders: [],
      organizer: null,
      attendees: [],
      conference: null,
      color: null,
      updated: null,
    })

  it("adds new events in start order and skips ones already present", () => {
    const prev = [event("jan", "2026-01-05"), event("mar", "2026-03-05")]
    const merged = mergeEvents(prev, [event("feb", "2026-02-05"), event("jan", "2026-01-05")])
    expect(merged.map((e) => e.id)).toEqual(["jan", "feb", "mar"])
  })

  it("returns the same list when nothing is new", () => {
    const prev = [event("jan", "2026-01-05")]
    expect(mergeEvents(prev, [event("jan", "2026-01-05")])).toBe(prev)
  })
})
