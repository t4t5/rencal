import { describe, expect, it } from "vitest"

import { getLocalTzid, type EventTime } from "@/lib/event-time"
import { fromRpcEventTime } from "@/lib/event-time/rpc"

import { getAgendaEventDisplay } from "./agendaEventDisplay"

const zoned = (wallclock: string): EventTime =>
  fromRpcEventTime({ kind: "datetime_zoned", wallclock, tzid: getLocalTzid() })

const event = (start: string, end: string) => ({
  start: zoned(start),
  end: zoned(end),
})

describe("getAgendaEventDisplay", () => {
  it("uses boundary labels and all-day styling for fully covered days", () => {
    const multiDay = event("2026-07-24T19:00:00", "2026-07-27T05:00:00")

    expect(getAgendaEventDisplay(multiDay, "2026-07-24")).toBe("starts-at")
    expect(getAgendaEventDisplay(multiDay, "2026-07-25")).toBe("all-day")
    expect(getAgendaEventDisplay(multiDay, "2026-07-26")).toBe("all-day")
    expect(getAgendaEventDisplay(multiDay, "2026-07-27")).toBe("ends-at")
  })

  it("keeps both partial days timed when no day is fully covered", () => {
    const overnight = event("2026-07-24T19:00:00", "2026-07-25T05:00:00")

    expect(getAgendaEventDisplay(overnight, "2026-07-24")).toBe("starts-at")
    expect(getAgendaEventDisplay(overnight, "2026-07-25")).toBe("ends-at")
  })

  it("uses all-day styling for fully covered boundary days", () => {
    const startsAtMidnight = event("2026-07-24T00:00:00", "2026-07-25T05:00:00")
    const endsAtMidnight = event("2026-07-24T19:00:00", "2026-07-26T00:00:00")
    const exactFullDay = event("2026-07-24T00:00:00", "2026-07-25T00:00:00")

    expect(getAgendaEventDisplay(startsAtMidnight, "2026-07-24")).toBe("all-day")
    expect(getAgendaEventDisplay(startsAtMidnight, "2026-07-25")).toBe("ends-at")
    expect(getAgendaEventDisplay(endsAtMidnight, "2026-07-24")).toBe("starts-at")
    expect(getAgendaEventDisplay(endsAtMidnight, "2026-07-25")).toBe("all-day")
    expect(getAgendaEventDisplay(exactFullDay, "2026-07-24")).toBe("all-day")
  })

  it("shows only a start boundary when a partial event ends at midnight", () => {
    const endsNextMidnight = event("2026-07-24T19:00:00", "2026-07-25T00:00:00")

    expect(getAgendaEventDisplay(endsNextMidnight, "2026-07-24")).toBe("starts-at")
  })

  it("keeps single-day timed events as a time range", () => {
    const singleDay = event("2026-07-24T19:00:00", "2026-07-24T21:00:00")

    expect(getAgendaEventDisplay(singleDay, "2026-07-24")).toBe("time-range")
  })
})
