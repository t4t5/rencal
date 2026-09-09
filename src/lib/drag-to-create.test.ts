import { Temporal } from "@js-temporal/polyfill"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  getViewerTzid,
  setViewerTzid,
  toViewerZonedDateTime,
  type EventTime,
} from "@/lib/event-time"

import {
  clampPointToRect,
  daySelectionForPointer,
  daySelectionRange,
  minutesAtY,
  selectionForPointer,
  selectionRange,
} from "./drag-to-create"

function wallclock(eventTime: EventTime): string {
  const value = toViewerZonedDateTime(eventTime)
  return `${value.toPlainDate().toString()} ${String(value.hour).padStart(2, "0")}:${String(value.minute).padStart(2, "0")}`
}

describe("selectionForPointer", () => {
  it("selects the anchor's 15-minute slot without extending it", () => {
    expect(selectionForPointer(9 * 60 + 7, 9 * 60 + 8)).toEqual({
      startMinutes: 9 * 60,
      endMinutes: 9 * 60 + 15,
    })
  })

  it("rounds the end up when dragging down", () => {
    expect(selectionForPointer(9 * 60 + 7, 10 * 60 + 2)).toEqual({
      startMinutes: 9 * 60,
      endMinutes: 10 * 60 + 15,
    })
  })

  it("rounds the start down when dragging up", () => {
    expect(selectionForPointer(9 * 60 + 7, 8 * 60 + 52)).toEqual({
      startMinutes: 8 * 60 + 45,
      endMinutes: 9 * 60 + 15,
    })
  })

  it("clamps pointers outside the day", () => {
    expect(selectionForPointer(60, -100)).toEqual({ startMinutes: 0, endMinutes: 75 })
    expect(selectionForPointer(23 * 60 + 50, 1600)).toEqual({
      startMinutes: 23 * 60 + 45,
      endMinutes: 24 * 60,
    })
  })

  it("keeps an anchor on the bottom edge in the day's final slot", () => {
    expect(selectionForPointer(24 * 60, 24 * 60)).toEqual({
      startMinutes: 23 * 60 + 45,
      endMinutes: 24 * 60,
    })
  })
})

describe("selectionRange", () => {
  const originalTz = getViewerTzid()
  beforeEach(() => setViewerTzid("Europe/Stockholm"))
  afterEach(() => setViewerTzid(originalTz))

  it("turns an end at 24:00 into midnight on the next day", () => {
    const range = selectionRange(Temporal.PlainDate.from("2025-03-30"), {
      startMinutes: 23 * 60 + 45,
      endMinutes: 24 * 60,
    })

    expect(wallclock(range.start)).toBe("2025-03-30 23:45")
    expect(wallclock(range.end)).toBe("2025-03-31 00:00")
  })
})

describe("minutesAtY", () => {
  const rect = { top: 100, height: 1440 }

  it("maps the top, midpoint, and bottom of a column", () => {
    expect(minutesAtY(rect, 100)).toBe(0)
    expect(minutesAtY(rect, 820)).toBe(720)
    expect(minutesAtY(rect, 1540)).toBe(1440)
  })
})

describe("daySelectionForPointer", () => {
  const anchor = Temporal.PlainDate.from("2026-09-09")

  it("grows after, before, and equal to the anchor", () => {
    expect(daySelectionForPointer(anchor, Temporal.PlainDate.from("2026-09-12"))).toEqual({
      start: anchor,
      end: Temporal.PlainDate.from("2026-09-12"),
    })
    expect(daySelectionForPointer(anchor, Temporal.PlainDate.from("2026-09-06"))).toEqual({
      start: Temporal.PlainDate.from("2026-09-06"),
      end: anchor,
    })
    expect(daySelectionForPointer(anchor, anchor)).toEqual({ start: anchor, end: anchor })
  })
})

describe("daySelectionRange", () => {
  it("creates an all-day range with an exclusive end", () => {
    const range = daySelectionRange({
      start: Temporal.PlainDate.from("2026-09-09"),
      end: Temporal.PlainDate.from("2026-09-12"),
    })

    expect(range.start).toEqual({
      kind: "date",
      value: Temporal.PlainDate.from("2026-09-09"),
    })
    expect(range.end).toEqual({
      kind: "date",
      value: Temporal.PlainDate.from("2026-09-13"),
    })
  })
})

describe("clampPointToRect", () => {
  const rect = { left: 10, right: 110, top: 20, bottom: 220 } as DOMRectReadOnly

  it("clamps each edge with a one-pixel inset", () => {
    expect(clampPointToRect(rect, 0, 50)).toEqual({ x: 11, y: 50 })
    expect(clampPointToRect(rect, 200, 50)).toEqual({ x: 109, y: 50 })
    expect(clampPointToRect(rect, 50, 0)).toEqual({ x: 50, y: 21 })
    expect(clampPointToRect(rect, 50, 300)).toEqual({ x: 50, y: 219 })
  })
})
