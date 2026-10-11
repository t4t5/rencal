import { Temporal } from "@js-temporal/polyfill"
import { rrulestr } from "rrule"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { getViewerTzid, setViewerTzid, type EventTime } from "./event-time"
import {
  matchUntilToStart,
  recurrenceCount,
  recurrenceEndDate,
  withRecurrenceEnd,
} from "./recurrence-end"

const allDay: EventTime = { kind: "date", value: Temporal.PlainDate.from("2026-10-07") }
const zoned: EventTime = {
  kind: "datetime_zoned",
  value: Temporal.ZonedDateTime.from("2026-10-07T09:00[Europe/Berlin]"),
}
const floating: EventTime = {
  kind: "datetime_floating",
  value: Temporal.PlainDateTime.from("2026-10-07T09:00"),
}
const utc: EventTime = { kind: "datetime_utc", value: Temporal.Instant.from("2026-10-07T07:00Z") }

const end = Temporal.PlainDate.from("2026-10-28")

let viewerTzid: string
beforeEach(() => {
  viewerTzid = getViewerTzid()
  setViewerTzid("America/Los_Angeles")
})
afterEach(() => setViewerTzid(viewerTzid))

describe("withRecurrenceEnd", () => {
  it("writes UNTIL in the form each start kind requires", () => {
    expect(withRecurrenceEnd("FREQ=WEEKLY", allDay, end)).toBe("FREQ=WEEKLY;UNTIL=20261028")
    expect(withRecurrenceEnd("FREQ=WEEKLY", floating, end)).toBe(
      "FREQ=WEEKLY;UNTIL=20261028T235959",
    )
    // End of Oct 28 in Berlin (CET after the DST change on Oct 25) in UTC.
    expect(withRecurrenceEnd("FREQ=WEEKLY", zoned, end)).toBe("FREQ=WEEKLY;UNTIL=20261028T225959Z")
    // UTC starts end at the end of the day in the viewer's zone.
    expect(withRecurrenceEnd("FREQ=WEEKLY", utc, end)).toBe("FREQ=WEEKLY;UNTIL=20261029T065959Z")
  })

  it("replaces an existing UNTIL or COUNT and strips the RRULE prefix", () => {
    expect(withRecurrenceEnd("RRULE:FREQ=DAILY;COUNT=5;INTERVAL=2", allDay, end)).toBe(
      "FREQ=DAILY;INTERVAL=2;UNTIL=20261028",
    )
    expect(withRecurrenceEnd("FREQ=DAILY;UNTIL=20261101", allDay, null)).toBe("FREQ=DAILY")
  })

  it("includes an occurrence late on the end date and none after it", () => {
    const rule = rrulestr(withRecurrenceEnd("FREQ=DAILY", zoned, end), {
      dtstart: new Date("2026-10-27T22:30:00Z"), // 23:30 in Berlin
    })
    expect(rule.all().map((d) => d.toISOString())).toEqual([
      "2026-10-27T22:30:00.000Z",
      "2026-10-28T22:30:00.000Z",
    ])
  })
})

describe("recurrenceEndDate", () => {
  it.each([
    ["all-day", allDay],
    ["zoned", zoned],
    ["floating", floating],
    ["utc", utc],
  ])("round-trips the end date for a %s start", (_, start) => {
    expect(recurrenceEndDate(withRecurrenceEnd("FREQ=WEEKLY", start, end), start)).toEqual(end)
  })

  it("survives rrule.js re-serializing UNTIL as UTC", () => {
    for (const start of [allDay, floating, zoned]) {
      const reserialized = rrulestr(withRecurrenceEnd("FREQ=WEEKLY", start, end)).toString()
      expect(recurrenceEndDate(reserialized, start)).toEqual(end)
    }
  })

  it("returns null for an endless rule", () => {
    expect(recurrenceEndDate("FREQ=WEEKLY;COUNT=3", zoned)).toBeNull()
  })
})

describe("recurrenceCount", () => {
  it("reads COUNT", () => {
    expect(recurrenceCount("FREQ=WEEKLY;COUNT=3")).toBe(3)
    expect(recurrenceCount("FREQ=WEEKLY")).toBeNull()
  })
})

describe("matchUntilToStart", () => {
  it("rewrites an UNTIL whose form no longer matches the start", () => {
    // A zoned series toggled to all-day.
    const zonedRule = withRecurrenceEnd("FREQ=WEEKLY", zoned, end)
    expect(matchUntilToStart(zonedRule, allDay)).toBe("FREQ=WEEKLY;UNTIL=20261028")
    // An all-day series toggled to timed.
    expect(matchUntilToStart("FREQ=WEEKLY;UNTIL=20261028", zoned)).toBe(
      "FREQ=WEEKLY;UNTIL=20261028T225959Z",
    )
  })

  it("keeps an UNTIL that already matches, even mid-day", () => {
    const split = "FREQ=DAILY;UNTIL=20261028T075959Z"
    expect(matchUntilToStart(split, zoned)).toBe(split)
    expect(matchUntilToStart("FREQ=DAILY", zoned)).toBe("FREQ=DAILY")
  })
})
