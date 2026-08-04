import { describe, expect, it } from "vitest"

import type { EventTimeRange } from "@/lib/event-time"
import { fromRpcEventTime, toRpcEventTime } from "@/lib/event-time/rpc"

import { anchorRangeToRecurringMaster } from "./recurrence-edit"

const zoned = (wallclock: string) =>
  fromRpcEventTime({ kind: "datetime_zoned", wallclock, tzid: "Europe/London" })
const date = (value: string) => fromRpcEventTime({ kind: "date", date: value })

describe("anchorRangeToRecurringMaster", () => {
  it("converts a timed recurring master to an all-day range", () => {
    const current: EventTimeRange = {
      start: date("2026-08-24"),
      end: date("2026-08-25"),
    }

    const result = anchorRangeToRecurringMaster(current, zoned("2021-08-24T09:00:00"))

    expect(toRpcEventTime(result.start)).toEqual({ kind: "date", date: "2021-08-24" })
    expect(toRpcEventTime(result.end)).toEqual({ kind: "date", date: "2021-08-25" })
  })

  it("keeps a timed edit timed while restoring the master's anchor date", () => {
    const current: EventTimeRange = {
      start: zoned("2026-08-24T10:30:00"),
      end: zoned("2026-08-24T11:30:00"),
    }

    const result = anchorRangeToRecurringMaster(current, zoned("2021-08-24T09:00:00"))

    expect(toRpcEventTime(result.start)).toEqual({
      kind: "datetime_zoned",
      wallclock: "2021-08-24T10:30:00",
      tzid: "Europe/London",
    })
    expect(toRpcEventTime(result.end)).toEqual({
      kind: "datetime_zoned",
      wallclock: "2021-08-24T11:30:00",
      tzid: "Europe/London",
    })
  })
})
