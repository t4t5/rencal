import { Temporal } from "@js-temporal/polyfill"
import { describe, expect, it } from "vitest"

import {
  addDays,
  addMinutes,
  coversFullDay,
  enumerateLocalDateKeys,
  formatDateKey,
  getEventDayRange,
  getLocalTzid,
  setLocalTzid,
  subscribeLocalTzid,
  toViewerZonedDateTime,
  wallclockTime,
  isAllDay,
  isSameDay,
  normalizeAllDayRange,
  plainDate,
  toAllDay,
  dateInEventZone,
  instantForOrdering,
  toTimedAtStartOfDay,
  withEventDate,
  withWallclockTime,
  type EventTime,
} from "./event-time"
import { fromRpcEventTime, toRpcEventTime } from "./event-time/rpc"

const date = (s: string): EventTime => fromRpcEventTime({ kind: "date", date: s })
const utc = (s: string): EventTime => fromRpcEventTime({ kind: "datetime_utc", instant: s })
const floating = (s: string): EventTime =>
  fromRpcEventTime({ kind: "datetime_floating", wallclock: s })
const zoned = (wallclock: string, tzid: string): EventTime =>
  fromRpcEventTime({ kind: "datetime_zoned", wallclock, tzid })

describe("RPC round-trip", () => {
  it("date", () => {
    const w = { kind: "date" as const, date: "2026-04-28" }
    expect(toRpcEventTime(fromRpcEventTime(w))).toEqual(w)
  })

  it("datetime_floating", () => {
    const w = { kind: "datetime_floating" as const, wallclock: "2026-04-28T09:00:00" }
    expect(toRpcEventTime(fromRpcEventTime(w))).toEqual(w)
  })

  it("datetime_zoned preserves tzid", () => {
    const w = {
      kind: "datetime_zoned" as const,
      wallclock: "2026-04-28T09:00:00",
      tzid: "America/Los_Angeles",
    }
    expect(toRpcEventTime(fromRpcEventTime(w))).toEqual(w)
  })

  it("datetime_utc round-trips by instant", () => {
    const w = { kind: "datetime_utc" as const, instant: "2026-04-28T10:00:00Z" }
    const round = toRpcEventTime(fromRpcEventTime(w))
    // The string form may differ ("Z" vs "+00:00"), so compare by parsed instant.
    expect(fromRpcEventTime(round)).toEqual(fromRpcEventTime(w))
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

describe("withEventDate", () => {
  it("changes the date but preserves wallclock and zone for zoned events", () => {
    const before = zoned("2026-04-28T09:00:00", "America/Los_Angeles")
    const newPd = Temporal.PlainDate.from("2026-05-15")
    const after = withEventDate(before, newPd)
    expect(after.kind).toBe("datetime_zoned")
    if (after.kind !== "datetime_zoned") return
    expect(after.value.timeZoneId).toBe("America/Los_Angeles")
    expect(after.value.toPlainDateTime().toString()).toBe("2026-05-15T09:00:00")
  })

  it("swaps the PlainDate for all-day", () => {
    const before = date("2026-04-28")
    const newPd = Temporal.PlainDate.from("2026-05-15")
    const after = withEventDate(before, newPd)
    expect(after.kind).toBe("date")
    if (after.kind !== "date") return
    expect(after.value.toString()).toBe("2026-05-15")
  })
})

describe("dateInEventZone", () => {
  it("returns the event's own-zone date for zoned events", () => {
    // 23:00 Stockholm on 2026-04-28 is still 2026-04-28 in Stockholm — even
    // though it's a different date in some other zones.
    const ev = zoned("2026-04-28T23:00:00", "Europe/Stockholm")
    expect(dateInEventZone(ev).toString()).toBe("2026-04-28")
  })
})

describe("wallclockTime", () => {
  it("returns wallclock in the event's OWN zone", () => {
    const ev = zoned("2026-04-28T09:30:00", "America/Los_Angeles")
    expect(wallclockTime(ev)).toEqual({ hour: 9, minute: 30 })
  })

  it("returns 0/0 for all-day", () => {
    expect(wallclockTime(date("2026-04-28"))).toEqual({ hour: 0, minute: 0 })
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

  it("detects viewer-zone midnight after the system timezone changes", () => {
    const original = getLocalTzid()
    const other = original === "America/New_York" ? "Europe/London" : "America/New_York"
    try {
      setLocalTzid(other)
      const start = zoned("2026-08-17T22:00:00", other)
      const end = zoned("2026-08-18T00:00:00", other)
      const { firstMs, lastMs } = getEventDayRange(start, end)
      expect(firstMs).toBe(lastMs)
    } finally {
      setLocalTzid(original)
    }
  })

  it("uses calendar arithmetic for exclusive ends across DST", () => {
    const originalProcessTz = process.env.TZ
    const originalViewerTz = getLocalTzid()
    try {
      process.env.TZ = "Europe/London"
      setLocalTzid("Europe/London")

      const { lastMs } = getEventDayRange(date("2026-03-28"), date("2026-03-30"))
      expect(lastMs).toBe(new Date(2026, 2, 29).getTime())
    } finally {
      if (originalProcessTz === undefined) delete process.env.TZ
      else process.env.TZ = originalProcessTz
      setLocalTzid(originalViewerTz)
    }
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
  it("single-day timed event yields a single key", () => {
    const tz = getLocalTzid()
    const start = zoned("2026-04-28T09:00:00", tz)
    const end = zoned("2026-04-28T10:00:00", tz)
    expect(Array.from(enumerateLocalDateKeys(start, end))).toEqual(["2026-04-28"])
  })

  it("multi-day timed event enumerates every occupied day", () => {
    const tz = getLocalTzid()
    const start = zoned("2026-04-28T19:00:00", tz)
    const end = zoned("2026-05-01T05:00:00", tz)
    expect(Array.from(enumerateLocalDateKeys(start, end))).toEqual([
      "2026-04-28",
      "2026-04-29",
      "2026-04-30",
      "2026-05-01",
    ])
  })

  it("timed event ending at midnight excludes the end date", () => {
    const tz = getLocalTzid()
    const start = zoned("2026-04-28T19:00:00", tz)
    const end = zoned("2026-05-01T00:00:00", tz)
    expect(Array.from(enumerateLocalDateKeys(start, end))).toEqual([
      "2026-04-28",
      "2026-04-29",
      "2026-04-30",
    ])
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

describe("coversFullDay", () => {
  const timed = (start: string, end: string) => {
    const tz = getLocalTzid()
    return [zoned(start, tz), zoned(end, tz)] as const
  }

  it("is false for single-day and overnight partial events", () => {
    const [start, end] = timed("2026-07-24T19:00:00", "2026-07-24T21:00:00")
    expect(coversFullDay(start, end, "2026-07-24")).toBe(false)

    const [oStart, oEnd] = timed("2026-07-24T19:00:00", "2026-07-25T05:00:00")
    expect(coversFullDay(oStart, oEnd, "2026-07-24")).toBe(false)
    expect(coversFullDay(oStart, oEnd, "2026-07-25")).toBe(false)
  })

  it("is true only for the fully covered middle days of a multi-day event", () => {
    const [start, end] = timed("2026-07-24T19:00:00", "2026-07-27T05:00:00")
    expect(coversFullDay(start, end, "2026-07-24")).toBe(false)
    expect(coversFullDay(start, end, "2026-07-25")).toBe(true)
    expect(coversFullDay(start, end, "2026-07-26")).toBe(true)
    expect(coversFullDay(start, end, "2026-07-27")).toBe(false)
  })

  it("treats boundary days starting or ending exactly at midnight as covered", () => {
    const [aStart, aEnd] = timed("2026-07-24T00:00:00", "2026-07-25T05:00:00")
    expect(coversFullDay(aStart, aEnd, "2026-07-24")).toBe(true)
    expect(coversFullDay(aStart, aEnd, "2026-07-25")).toBe(false)

    const [bStart, bEnd] = timed("2026-07-24T19:00:00", "2026-07-26T00:00:00")
    expect(coversFullDay(bStart, bEnd, "2026-07-24")).toBe(false)
    expect(coversFullDay(bStart, bEnd, "2026-07-25")).toBe(true)

    const [cStart, cEnd] = timed("2026-07-24T00:00:00", "2026-07-25T00:00:00")
    expect(coversFullDay(cStart, cEnd, "2026-07-24")).toBe(true)
  })

  it("stays partial when a partial event ends at the next midnight", () => {
    const [start, end] = timed("2026-07-24T19:00:00", "2026-07-25T00:00:00")
    expect(coversFullDay(start, end, "2026-07-24")).toBe(false)
  })

  it("is true for all-day events on the days they occupy", () => {
    expect(coversFullDay(date("2026-07-24"), date("2026-07-25"), "2026-07-24")).toBe(true)
  })
})

describe("instantForOrdering ordering", () => {
  it("a zoned 09:00 Stockholm sorts before 09:00 LA on the same date", () => {
    const sthlm = zoned("2026-04-28T09:00:00", "Europe/Stockholm")
    const la = zoned("2026-04-28T09:00:00", "America/Los_Angeles")
    expect(instantForOrdering(sthlm).epochMilliseconds).toBeLessThan(
      instantForOrdering(la).epochMilliseconds,
    )
  })
})

describe("plainDate", () => {
  it("constructs a date variant", () => {
    const d = plainDate(2026, 4, 28)
    expect(d.kind).toBe("date")
    expect(formatDateKey(d)).toBe("2026-04-28")
  })
})

describe("local zone store", () => {
  it("updates getLocalTzid, notifies subscribers, and rejects unknown zones", () => {
    const original = getLocalTzid()
    const other = original === "Europe/Stockholm" ? "America/Los_Angeles" : "Europe/Stockholm"
    let notified = 0
    const unsubscribe = subscribeLocalTzid(() => notified++)
    try {
      setLocalTzid(other)
      expect(getLocalTzid()).toBe(other)
      expect(notified).toBe(1)

      // Same value → no notification.
      setLocalTzid(other)
      expect(notified).toBe(1)

      // Unknown zone → ignored.
      setLocalTzid("Not/AZone")
      expect(getLocalTzid()).toBe(other)
      expect(notified).toBe(1)
    } finally {
      unsubscribe()
      setLocalTzid(original)
    }
  })

  it("changes the zone used by viewer projections", () => {
    const original = getLocalTzid()
    const et = zoned("2026-04-28T09:00:00", "Europe/Stockholm")
    try {
      // 09:00 CEST is 00:00 the same day in Los Angeles.
      setLocalTzid("America/Los_Angeles")
      expect(toViewerZonedDateTime(et).hour).toBe(0)
      expect(formatDateKey(et)).toBe("2026-04-28")

      // ...and 21:00 the same day in Kiritimati (UTC+14).
      setLocalTzid("Pacific/Kiritimati")
      expect(toViewerZonedDateTime(et).hour).toBe(21)
      expect(formatDateKey(et)).toBe("2026-04-28")
    } finally {
      setLocalTzid(original)
    }
  })
})
