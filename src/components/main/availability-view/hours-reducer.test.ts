import { describe, expect, it } from "vitest"

import type { DayHours } from "@/lib/api"

import { hoursReducer, invalidRange, mergeRanges, normalizeHours } from "./hours-reducer"

const weekdays = (ranges: { start: string; end: string }[]): DayHours[] =>
  normalizeHours(["mo", "tu", "we", "th", "fr"].map((day) => ({ day, ranges }) as DayHours))

const r = (start: string, end: string) => ({ start, end })

const rangesOf = (hours: DayHours[], day: string) => hours.find((h) => h.day === day)?.ranges

describe("hoursReducer", () => {
  it("fills missing days Monday-first", () => {
    const hours = normalizeHours([{ day: "su", ranges: [r("10:00", "11:00")] }])
    expect(hours.map((h) => h.day)).toEqual(["mo", "tu", "we", "th", "fr", "sa", "su"])
    expect(rangesOf(hours, "su")).toEqual([r("10:00", "11:00")])
  })

  it("toggles a day off and back on with the default range", () => {
    const off = hoursReducer(weekdays([r("10:00", "12:00")]), {
      type: "toggle",
      day: "mo",
      on: false,
    })
    expect(rangesOf(off, "mo")).toEqual([])
    const on = hoursReducer(off, { type: "toggle", day: "mo", on: true })
    expect(rangesOf(on, "mo")).toEqual([r("09:00", "17:00")])
  })

  it("adds a range an hour after the last one, or none late in the day", () => {
    const hours = hoursReducer(weekdays([r("09:00", "12:00")]), { type: "add", day: "mo" })
    expect(rangesOf(hours, "mo")).toEqual([r("09:00", "12:00"), r("13:00", "14:00")])

    const late = weekdays([r("09:00", "22:30")])
    expect(hoursReducer(late, { type: "add", day: "mo" })).toEqual(late)

    const empty = hoursReducer(weekdays([]), { type: "add", day: "sa" })
    expect(rangesOf(empty, "sa")).toEqual([r("09:00", "17:00")])
  })

  it("edits and removes a range", () => {
    let hours = weekdays([r("09:00", "12:00"), r("13:00", "17:00")])
    hours = hoursReducer(hours, { type: "set", day: "tu", index: 1, range: { end: "18:00" } })
    hours = hoursReducer(hours, { type: "remove", day: "tu", index: 0 })
    expect(rangesOf(hours, "tu")).toEqual([r("13:00", "18:00")])
    expect(rangesOf(hours, "mo")).toEqual([r("09:00", "12:00"), r("13:00", "17:00")])
  })

  it("merges overlapping and touching ranges, keeping inverted ones for validation", () => {
    expect(
      mergeRanges([
        r("13:00", "17:00"),
        r("09:00", "13:00"),
        r("16:00", "18:00"),
        r("20:00", "19:00"),
      ]),
    ).toEqual([r("09:00", "18:00"), r("20:00", "19:00")])

    const hours = hoursReducer(weekdays([r("09:00", "12:00"), r("11:00", "14:00")]), {
      type: "merge",
      day: "we",
    })
    expect(rangesOf(hours, "we")).toEqual([r("09:00", "14:00")])
  })

  it("copies a day's times to other days", () => {
    const hours = hoursReducer(
      hoursReducer(weekdays([]), { type: "set", day: "mo", index: 0, range: {} }),
      { type: "copy", from: "mo", to: ["sa", "su"] },
    )
    expect(rangesOf(hours, "sa")).toEqual([])

    const copied = hoursReducer(weekdays([r("08:00", "10:00")]), {
      type: "copy",
      from: "mo",
      to: ["sa", "su"],
    })
    expect(rangesOf(copied, "sa")).toEqual([r("08:00", "10:00")])
    expect(rangesOf(copied, "su")).toEqual([r("08:00", "10:00")])
  })

  it("finds the first inverted range", () => {
    const hours = hoursReducer(weekdays([r("09:00", "17:00")]), {
      type: "set",
      day: "th",
      index: 0,
      range: { end: "08:00" },
    })
    expect(invalidRange(hours)).toEqual({ day: "th", index: 0 })
    expect(invalidRange(weekdays([r("09:00", "17:00")]))).toBeNull()
  })
})
