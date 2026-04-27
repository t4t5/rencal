import { Temporal } from "@js-temporal/polyfill"
import { describe, expect, it } from "vitest"

import {
  addDays,
  addMinutes,
  enumerateLocalDateKeys,
  formatDateKey,
  fromWire,
  getEventDayRange,
  getLocalTzid,
  getWallclockTime,
  isAllDay,
  isSameDay,
  normalizeAllDayRange,
  plainDate,
  toAllDay,
  toEventDate,
  toInstant,
  toTimedAtStartOfDay,
  toWire,
  withCalendarDate,
  withWallclockTime,
  type EventDateTime,
} from "./event-time"

const date = (s: string): EventDateTime => fromWire({ kind: "date", date: s })
const utc = (s: string): EventDateTime => fromWire({ kind: "datetime_utc", instant: s })
const floating = (s: string): EventDateTime => fromWire({ kind: "datetime_floating", wallclock: s })
const zoned = (wallclock: string, tzid: string): EventDateTime =>
  fromWire({ kind: "datetime_zoned", wallclock, tzid })

describe("wire round-trip", () => {
  it("date", () => {
    const w = { kind: "date" as const, date: "2026-04-28" }
    expect(toWire(fromWire(w))).toEqual(w)
  })

  it("datetime_floating", () => {
    const w = { kind: "datetime_floating" as const, wallclock: "2026-04-28T09:00:00" }
    expect(toWire(fromWire(w))).toEqual(w)
  })

  it("datetime_zoned preserves tzid", () => {
    const w = {
      kind: "datetime_zoned" as const,
      wallclock: "2026-04-28T09:00:00",
      tzid: "America/Los_Angeles",
    }
    expect(toWire(fromWire(w))).toEqual(w)
  })

  it("datetime_utc round-trips by instant", () => {
    const w = { kind: "datetime_utc" as const, instant: "2026-04-28T10:00:00Z" }
    const round = toWire(fromWire(w))
    // The string form may differ ("Z" vs "+00:00"), so compare by parsed instant.
    expect(fromWire(round)).toEqual(fromWire(w))
  })
})

describe("isAllDay", () => {
  it("true for date variant", () => {
    expect(isAllDay(date("2026-04-28"))).toBe(true)
  })

  it("false for timed variants", () => {
    expect(isAllDay(zoned("2026-04-28T09:00:00", "Europe/Stockholm"))).toBe(false)
    expect(isAllDay(utc("2026-04-28T10:00:00Z"))).toBe(false)
    expect(isAllDay(floating("2026-04-28T09:00:00"))).toBe(false)
  })
})

describe("withWallclockTime", () => {
  it("changes wallclock in the event's OWN zone (not the viewer's)", () => {
    // An LA-authored 9am event. The user changes the time to 10:30. The event
    // should keep its LA zone identity, and the new wallclock 10:30 should be
    // 10:30 in LA — not in the viewer's zone.
    const before = zoned("2026-04-28T09:00:00", "America/Los_Angeles")
    const after = withWallclockTime(before, 10, 30)
    expect(after.kind).toBe("datetime_zoned")
    if (after.kind !== "datetime_zoned") return
    expect(after.value.timeZoneId).toBe("America/Los_Angeles")
    expect(after.value.toPlainDateTime().toString()).toBe("2026-04-28T10:30:00")
  })

  it("is a no-op for all-day", () => {
    const d = date("2026-04-28")
    expect(withWallclockTime(d, 10, 30)).toEqual(d)
  })

  it("preserves floating variant", () => {
    const before = floating("2026-04-28T09:00:00")
    const after = withWallclockTime(before, 11, 15)
    expect(after.kind).toBe("datetime_floating")
    if (after.kind !== "datetime_floating") return
    expect(after.value.toString()).toBe("2026-04-28T11:15:00")
  })
})

describe("withCalendarDate", () => {
  it("changes the date but preserves wallclock and zone for zoned events", () => {
    const before = zoned("2026-04-28T09:00:00", "America/Los_Angeles")
    const newPd = Temporal.PlainDate.from("2026-05-15")
    const after = withCalendarDate(before, newPd)
    expect(after.kind).toBe("datetime_zoned")
    if (after.kind !== "datetime_zoned") return
    expect(after.value.timeZoneId).toBe("America/Los_Angeles")
    expect(after.value.toPlainDateTime().toString()).toBe("2026-05-15T09:00:00")
  })

  it("swaps the PlainDate for all-day", () => {
    const before = date("2026-04-28")
    const newPd = Temporal.PlainDate.from("2026-05-15")
    const after = withCalendarDate(before, newPd)
    expect(after.kind).toBe("date")
    if (after.kind !== "date") return
    expect(after.value.toString()).toBe("2026-05-15")
  })
})

describe("toEventDate", () => {
  it("returns the event's own-zone date for zoned events", () => {
    // 23:00 Stockholm on 2026-04-28 is still 2026-04-28 in Stockholm — even
    // though it's a different date in some other zones.
    const ev = zoned("2026-04-28T23:00:00", "Europe/Stockholm")
    expect(toEventDate(ev).toString()).toBe("2026-04-28")
  })
})

describe("getWallclockTime", () => {
  it("returns wallclock in the event's OWN zone", () => {
    const ev = zoned("2026-04-28T09:30:00", "America/Los_Angeles")
    expect(getWallclockTime(ev)).toEqual({ hour: 9, minute: 30 })
  })

  it("returns 0/0 for all-day", () => {
    expect(getWallclockTime(date("2026-04-28"))).toEqual({ hour: 0, minute: 0 })
  })
})

describe("addDays across DST", () => {
  it("zoned event keeps its wallclock across spring-forward", () => {
    // EU spring-forward 2026: 02:00 → 03:00 local on 2026-03-29.
    // Adding one day to "Saturday 09:00 Stockholm" should produce "Sunday 09:00 Stockholm",
    // not "Sunday 08:00" or "Sunday 10:00".
    const sat = zoned("2026-03-28T09:00:00", "Europe/Stockholm")
    const sun = addDays(sat, 1)
    expect(sun.kind).toBe("datetime_zoned")
    if (sun.kind !== "datetime_zoned") return
    expect(sun.value.toPlainDateTime().toString()).toBe("2026-03-29T09:00:00")
    expect(sun.value.timeZoneId).toBe("Europe/Stockholm")
  })

  it("date variant adds whole days", () => {
    const start = date("2026-02-28")
    expect(formatDateKey(addDays(start, 1))).toBe("2026-03-01")
  })
})

describe("addMinutes", () => {
  it("respects DST on a zoned event", () => {
    // 30 minutes added at 01:30 Stockholm on spring-forward day jumps over 02:00→03:00.
    // The Temporal ZonedDateTime arithmetic handles this — the resulting wallclock
    // is 03:00, not 02:00.
    const before = zoned("2026-03-29T01:30:00", "Europe/Stockholm")
    const after = addMinutes(before, 60)
    if (after.kind !== "datetime_zoned") throw new Error("expected zoned")
    expect(after.value.toPlainDateTime().toString()).toBe("2026-03-29T03:30:00")
  })
})

describe("toAllDay / toTimedAtStartOfDay", () => {
  it("toAllDay produces a PlainDate for the local-zone calendar day", () => {
    const t = zoned("2026-04-28T09:00:00", "Europe/Stockholm")
    const d = toAllDay(t)
    expect(d.kind).toBe("date")
  })

  it("toTimedAtStartOfDay produces a zoned event in the viewer's zone", () => {
    const d = date("2026-04-28")
    const t = toTimedAtStartOfDay(d)
    expect(t.kind).toBe("datetime_zoned")
    if (t.kind !== "datetime_zoned") return
    expect(t.value.timeZoneId).toBe(getLocalTzid())
    // Hour is 0 in the viewer's zone (start-of-day).
    expect(t.value.hour).toBe(0)
  })

  it("are inverse on a viewer-local zoned event", () => {
    const d = date("2026-04-28")
    expect(toAllDay(toTimedAtStartOfDay(d))).toEqual(d)
  })
})

describe("getEventDayRange", () => {
  it("all-day single-day occupies one day (DTEND exclusive)", () => {
    const start = date("2026-04-28")
    const end = date("2026-04-29")
    const { firstMs, lastMs } = getEventDayRange(start, end)
    expect(firstMs).toBe(lastMs)
  })

  it("all-day three-day spans the right inclusive range", () => {
    const start = date("2026-04-28")
    const end = date("2026-05-01") // exclusive: covers 28, 29, 30
    const { firstMs, lastMs } = getEventDayRange(start, end)
    const ms = (s: string) =>
      Temporal.PlainDate.from(s).toZonedDateTime(getLocalTzid()).epochMilliseconds
    expect(firstMs).toBe(ms("2026-04-28"))
    expect(lastMs).toBe(ms("2026-04-30"))
  })

  it("timed event ending exactly at midnight stops on the previous day", () => {
    const tz = getLocalTzid()
    const start = zoned("2026-04-28T22:00:00", tz)
    const end = zoned("2026-04-29T00:00:00", tz)
    const { firstMs, lastMs } = getEventDayRange(start, end)
    expect(firstMs).toBe(lastMs)
  })

  it("timed event spanning midnight covers two days", () => {
    const tz = getLocalTzid()
    const start = zoned("2026-04-28T22:00:00", tz)
    const end = zoned("2026-04-29T01:00:00", tz)
    const { firstMs, lastMs } = getEventDayRange(start, end)
    expect(lastMs - firstMs).toBeGreaterThan(0)
  })
})

describe("isSameDay", () => {
  it("two events at different times on the same local day", () => {
    const tz = getLocalTzid()
    expect(isSameDay(zoned("2026-04-28T09:00:00", tz), zoned("2026-04-28T22:00:00", tz))).toBe(true)
  })

  it("crosses midnight", () => {
    const tz = getLocalTzid()
    expect(isSameDay(zoned("2026-04-28T23:00:00", tz), zoned("2026-04-29T01:00:00", tz))).toBe(
      false,
    )
  })
})

describe("normalizeAllDayRange", () => {
  it("bumps end by a day when end is not after start", () => {
    const start = date("2026-04-28")
    const end = date("2026-04-28")
    const { end: bumped } = normalizeAllDayRange(start, end)
    expect(formatDateKey(bumped)).toBe("2026-04-29")
  })

  it("leaves a valid range alone", () => {
    const start = date("2026-04-28")
    const end = date("2026-05-01")
    const { end: out } = normalizeAllDayRange(start, end)
    expect(formatDateKey(out)).toBe("2026-05-01")
  })
})

describe("enumerateLocalDateKeys", () => {
  it("timed event yields a single key", () => {
    const tz = getLocalTzid()
    const start = zoned("2026-04-28T09:00:00", tz)
    const end = zoned("2026-04-28T10:00:00", tz)
    expect(Array.from(enumerateLocalDateKeys(start, end))).toEqual(["2026-04-28"])
  })

  it("all-day three-day enumerates start through end-exclusive", () => {
    const start = date("2026-04-28")
    const end = date("2026-05-01")
    expect(Array.from(enumerateLocalDateKeys(start, end))).toEqual([
      "2026-04-28",
      "2026-04-29",
      "2026-04-30",
    ])
  })

  it("degenerate single-day all-day still yields the start key", () => {
    const start = date("2026-04-28")
    const end = date("2026-04-28")
    expect(Array.from(enumerateLocalDateKeys(start, end))).toEqual(["2026-04-28"])
  })
})

describe("toInstant ordering", () => {
  it("a zoned 09:00 Stockholm sorts before 09:00 LA on the same date", () => {
    const sthlm = zoned("2026-04-28T09:00:00", "Europe/Stockholm")
    const la = zoned("2026-04-28T09:00:00", "America/Los_Angeles")
    expect(toInstant(sthlm).epochMilliseconds).toBeLessThan(toInstant(la).epochMilliseconds)
  })
})

describe("plainDate", () => {
  it("constructs a date variant", () => {
    const d = plainDate(2026, 4, 28)
    expect(d.kind).toBe("date")
    expect(formatDateKey(d)).toBe("2026-04-28")
  })
})
