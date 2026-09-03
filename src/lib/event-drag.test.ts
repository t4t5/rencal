import { Temporal } from "@js-temporal/polyfill"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import type { CalendarEvent } from "@/lib/cal-events"
import {
  allDayDate,
  atTime,
  computeEventDateInfo,
  getViewerTzid,
  setViewerTzid,
  toViewerZonedDateTime,
  type EventTime,
} from "@/lib/event-time"

import { computeDropRange, edgeScrollDelta, grabFor, makeDragPreview } from "./event-drag"

function makeEvent(start: EventTime, end: EventTime): CalendarEvent {
  return {
    id: "event",
    recurring_event_id: null,
    summary: "Book pub quiz",
    description: null,
    location: null,
    start,
    end,
    status: "confirmed",
    recurrence: null,
    master_recurrence: null,
    reminders: [],
    organizer: null,
    attendees: [],
    conference: null,
    calendar_slug: "calendar",
    color: null,
    updated: null,
    dateInfo: computeEventDateInfo(start, end),
  }
}

const day = (key: string) => Temporal.PlainDate.from(key)

function wallclock(et: EventTime): string {
  const z = toViewerZonedDateTime(et)
  return `${z.toPlainDate().toString()} ${String(z.hour).padStart(2, "0")}:${String(z.minute).padStart(2, "0")}`
}

describe("computeDropRange", () => {
  const originalTz = getViewerTzid()
  beforeEach(() => setViewerTzid("Europe/Stockholm"))
  afterEach(() => setViewerTzid(originalTz))

  const noGrab = { dayOffset: 0, minuteOffset: 0 }

  it("moves a timed event to another month cell, keeping its wallclock and duration", () => {
    const event = makeEvent(atTime(day("2025-07-12"), 17), atTime(day("2025-07-12"), 19, 30))

    const range = computeDropRange(
      event,
      { zone: "day", day: day("2025-07-14"), minutes: null },
      noGrab,
    )

    expect(range).not.toBeNull()
    expect(wallclock(range!.start)).toBe("2025-07-14 17:00")
    expect(wallclock(range!.end)).toBe("2025-07-14 19:30")
    expect(range!.start.kind).toBe("datetime_zoned")
  })

  it("returns null when dropped back onto its own day", () => {
    const event = makeEvent(atTime(day("2025-07-12"), 17), atTime(day("2025-07-12"), 18))

    expect(
      computeDropRange(event, { zone: "day", day: day("2025-07-12"), minutes: null }, noGrab),
    ).toBeNull()
  })

  it("moves an all-day event by whole days", () => {
    const event = makeEvent(allDayDate(day("2025-07-12")), allDayDate(day("2025-07-13")))

    const range = computeDropRange(
      event,
      { zone: "day", day: day("2025-07-20"), minutes: null },
      noGrab,
    )

    expect(range).toEqual({
      start: allDayDate(day("2025-07-20")),
      end: allDayDate(day("2025-07-21")),
    })
  })

  it("keeps the grabbed day under the pointer for a multi-day event", () => {
    // Runs Mon 7 → Wed 9 (DTEND exclusive Thu 10), grabbed on Wed.
    const event = makeEvent(allDayDate(day("2025-07-07")), allDayDate(day("2025-07-10")))
    const grab = grabFor(event, { zone: "day", day: day("2025-07-09"), minutes: null })
    expect(grab.dayOffset).toBe(2)

    const range = computeDropRange(
      event,
      { zone: "day", day: day("2025-07-16"), minutes: null },
      grab,
    )

    expect(range).toEqual({
      start: allDayDate(day("2025-07-14")),
      end: allDayDate(day("2025-07-17")),
    })
  })

  it("re-times a timed event in the week grid, snapping to 15 minutes and honouring the grab offset", () => {
    const event = makeEvent(atTime(day("2025-07-12"), 19), atTime(day("2025-07-12"), 20))
    // Grabbed 7 minutes into the block.
    const grab = grabFor(event, { zone: "timed", day: day("2025-07-12"), minutes: 19 * 60 + 7 })
    expect(grab.minuteOffset).toBe(7)

    // Pointer at 18:12 on the next day → block top at 18:05 → snaps to 18:00.
    const range = computeDropRange(
      event,
      { zone: "timed", day: day("2025-07-13"), minutes: 18 * 60 + 12 },
      grab,
    )

    expect(wallclock(range!.start)).toBe("2025-07-13 18:00")
    expect(wallclock(range!.end)).toBe("2025-07-13 19:00")
  })

  it("clamps a timed drop so the event stays inside the day", () => {
    const event = makeEvent(atTime(day("2025-07-12"), 9), atTime(day("2025-07-12"), 11))

    const late = computeDropRange(
      event,
      { zone: "timed", day: day("2025-07-12"), minutes: 23 * 60 + 30 },
      noGrab,
    )
    expect(wallclock(late!.start)).toBe("2025-07-12 22:00")
    expect(wallclock(late!.end)).toBe("2025-07-13 00:00")

    const early = computeDropRange(
      event,
      { zone: "timed", day: day("2025-07-12"), minutes: -40 },
      noGrab,
    )
    expect(wallclock(early!.start)).toBe("2025-07-12 00:00")
  })

  it("treats an event ending at midnight as lasting until midnight when clamping", () => {
    const event = makeEvent(atTime(day("2025-07-12"), 22), atTime(day("2025-07-13"), 0))

    const range = computeDropRange(
      event,
      { zone: "timed", day: day("2025-07-12"), minutes: 18 * 60 },
      noGrab,
    )

    expect(wallclock(range!.start)).toBe("2025-07-12 18:00")
    expect(wallclock(range!.end)).toBe("2025-07-12 20:00")
  })

  it("rejects kind changes between the all-day lane and the time grid", () => {
    const timed = makeEvent(atTime(day("2025-07-12"), 9), atTime(day("2025-07-12"), 10))
    const allDay = makeEvent(allDayDate(day("2025-07-12")), allDayDate(day("2025-07-13")))

    expect(
      computeDropRange(timed, { zone: "all-day", day: day("2025-07-14"), minutes: null }, noGrab),
    ).toBeNull()
    expect(
      computeDropRange(allDay, { zone: "timed", day: day("2025-07-14"), minutes: 600 }, noGrab),
    ).toBeNull()
  })

  it("moves a multi-day timed event across the all-day lane by whole days", () => {
    const event = makeEvent(atTime(day("2025-07-12"), 20), atTime(day("2025-07-13"), 10))

    const range = computeDropRange(
      event,
      { zone: "all-day", day: day("2025-07-15"), minutes: null },
      noGrab,
    )

    expect(wallclock(range!.start)).toBe("2025-07-15 20:00")
    expect(wallclock(range!.end)).toBe("2025-07-16 10:00")
  })
})

describe("makeDragPreview", () => {
  it("recomputes dateInfo and gives the preview its own id", () => {
    const event = makeEvent(atTime(day("2025-07-12"), 9), atTime(day("2025-07-12"), 10))
    const preview = makeDragPreview(event, {
      start: atTime(day("2025-07-14"), 9),
      end: atTime(day("2025-07-14"), 10),
    })

    expect(preview.id).not.toBe(event.id)
    expect(preview.dateInfo.firstDay).toBe(event.dateInfo.firstDay + 2)
  })
})

describe("edgeScrollDelta", () => {
  const rect = { left: 100, top: 100, right: 500, bottom: 400 }
  const both = { x: true, y: true }

  it("is zero away from the edges", () => {
    expect(edgeScrollDelta(rect, 300, 250, both)).toEqual({ dx: 0, dy: 0 })
  })

  it("scrolls towards the edge the pointer is near, faster the closer it gets", () => {
    const near = edgeScrollDelta(rect, 470, 250, both)
    const nearer = edgeScrollDelta(rect, 495, 250, both)
    expect(near.dx).toBeGreaterThan(0)
    expect(nearer.dx).toBeGreaterThan(near.dx)
    expect(near.dy).toBe(0)

    expect(edgeScrollDelta(rect, 300, 105, both).dy).toBeLessThan(0)
  })

  it("ignores axes the container cannot scroll", () => {
    expect(edgeScrollDelta(rect, 495, 105, { x: false, y: true })).toMatchObject({ dx: 0 })
  })

  it("stops when the pointer is far outside the container", () => {
    expect(edgeScrollDelta(rect, 800, 250, both)).toEqual({ dx: 0, dy: 0 })
  })
})
