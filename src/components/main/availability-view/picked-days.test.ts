import { Temporal } from "@js-temporal/polyfill"
import { describe, expect, it } from "vitest"

import {
  addRange,
  nextRange,
  offeredSpans,
  type PickedDay,
  rangeFrom,
  removeRange,
  setOffered,
  setRange,
} from "./picked-days"

const MON = Temporal.PlainDate.from("2026-11-09")
const TUE = Temporal.PlainDate.from("2026-11-10")
const range = (start: number, end: number) => ({ startMinutes: start * 60, endMinutes: end * 60 })
const monday: PickedDay = { date: MON, ranges: [range(9, 12)], offered: true }

describe("addRange", () => {
  it("adds new dates in date order", () => {
    const days = addRange(addRange([], TUE, range(9, 10)), MON, range(9, 10))
    expect(days.map((day) => day.date.toString())).toEqual(["2026-11-09", "2026-11-10"])
  })

  it("joins ranges that overlap or touch on a ticked date", () => {
    expect(addRange([monday], MON, range(12, 13))[0].ranges).toEqual([range(9, 13)])
    expect(addRange([monday], MON, range(14, 15))[0].ranges).toEqual([range(9, 12), range(14, 15)])
  })

  it("starts an unticked date afresh and ticks it", () => {
    const [day] = addRange(setOffered([monday], MON, false), MON, range(14, 15))
    expect(day).toMatchObject({ offered: true, ranges: [range(14, 15)] })
  })
})

it("joins ranges an edit pushes together, keeping them in order", () => {
  const days = addRange([monday], MON, range(14, 15))
  expect(setRange(days, MON, 1, range(11, 15))[0].ranges).toEqual([range(9, 15)])
  expect(setRange(days, MON, 0, range(16, 17))[0].ranges).toEqual([range(14, 15), range(16, 17)])
})

it("removes one range and leaves the date", () => {
  const days = addRange([monday], MON, range(14, 15))
  expect(removeRange(days, MON, 0)[0].ranges).toEqual([range(14, 15)])
})

describe("rangeFrom", () => {
  it("stops at midnight", () => {
    expect(rangeFrom(23 * 60 + 45, 30)).toEqual({ startMinutes: 1425, endMinutes: 1440 })
  })
})

describe("nextRange", () => {
  it("leaves an hour after the last range", () => {
    expect(nextRange([range(9, 12)], 30)).toEqual({ startMinutes: 780, endMinutes: 810 })
  })

  it("gives up when the day has no room", () => {
    expect(nextRange([range(22, 23)], 30)).toBeNull()
  })
})

describe("offeredSpans", () => {
  it("leaves unticked dates out", () => {
    const days = setOffered(addRange([monday], TUE, range(13, 14)), MON, false)
    const spans = offeredSpans(days, "UTC")
    expect(spans).toHaveLength(1)
    expect(spans[0].start.equals(Temporal.Instant.from("2026-11-10T13:00:00Z"))).toBe(true)
  })

  it("runs a range ending at midnight into the next day", () => {
    const [span] = offeredSpans(addRange([], MON, range(23, 24)), "UTC")
    expect(span.end.equals(Temporal.Instant.from("2026-11-10T00:00:00Z"))).toBe(true)
  })
})
