import { Temporal } from "@js-temporal/polyfill"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { freeTimesMessage } from "./free-times-message"

const at = (iso: string) => Temporal.Instant.from(iso)
const span = (start: string, end: string) => ({ start: at(start), end: at(end) })
const NEW_YORK = "America/New_York"

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date("2026-11-01T12:00:00Z"))
})

afterEach(() => {
  vi.useRealTimers()
})

describe("freeTimesMessage", () => {
  it("asks about the meeting length and lists each day in the recipient's zone", () => {
    const times = {
      windows: [
        span("2026-11-03T09:00:00Z", "2026-11-03T10:00:00Z"),
        span("2026-11-05T13:00:00Z", "2026-11-05T14:00:00Z"),
        span("2026-11-05T18:30:00Z", "2026-11-05T20:00:00Z"),
      ],
      durationMinutes: 30,
    }

    expect(freeTimesMessage(times, NEW_YORK, "12h")).toBe(
      [
        "Would 30 minutes during any of these times work for you? (all Eastern Time)",
        "Tue, 3 Nov: 4–5 AM",
        "Thu, 5 Nov: 8–9 AM, or 1:30–3 PM",
      ].join("\n"),
    )
  })

  it("writes in 24h and names the zone", () => {
    const times = {
      windows: [span("2026-11-03T09:00:00Z", "2026-11-03T10:30:00Z")],
      durationMinutes: 60,
    }

    expect(freeTimesMessage(times, "Europe/Stockholm", "24h")).toBe(
      [
        "Would 1 hour during any of these times work for you? (all Central European Time)",
        "Tue, 3 Nov: 10:00–11:30",
      ].join("\n"),
    )
  })

  it("keeps both periods when a range crosses noon", () => {
    const times = {
      windows: [span("2026-11-03T16:00:00Z", "2026-11-03T17:30:00Z")],
      durationMinutes: 30,
    }

    expect(freeTimesMessage(times, NEW_YORK, "12h")).toContain("Tue, 3 Nov: 11 AM – 12:30 PM")
  })

  it.each([
    ["24h", "Tue, 3 Nov: 22:00–24:00", "Wed, 4 Nov: 00:00–02:00"],
    ["12h", "Tue, 3 Nov: 10 PM – 12 AM", "Wed, 4 Nov: 12–2 AM"],
  ] as const)("splits a range at midnight in %s", (timeFormat, first, second) => {
    const times = {
      windows: [span("2026-11-04T03:00:00Z", "2026-11-04T07:00:00Z")],
      durationMinutes: 30,
    }

    const lines = freeTimesMessage(times, NEW_YORK, timeFormat).split("\n")
    expect(lines.slice(1)).toEqual([first, second])
  })
})
