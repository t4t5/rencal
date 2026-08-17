import { describe, expect, it } from "vitest"

import type { CalendarEvent } from "@/lib/cal-events"

import { assignAllDayLanes, buildAllDaySpan } from "./all-day-lanes"

function event(id: string, firstDay: number, lastDay: number): CalendarEvent {
  return {
    id,
    dateInfo: {
      firstDay,
      lastDay,
      startMs: 0,
      endDay: lastDay,
      startLocalMinutes: 0,
      endLocalMinutes: 0,
    },
  } as CalendarEvent
}

describe("buildAllDaySpan", () => {
  it("clamps spans to both range edges and records clipped ends", () => {
    const item = buildAllDaySpan(event("clipped", 8, 15), 10, 13, "red")

    expect(item).toMatchObject({
      calendarColor: "red",
      startCol: 1,
      endCol: 5,
      lane: 0,
      isStart: false,
      isEnd: false,
    })
  })

  it("records unclipped starts and ends", () => {
    expect(buildAllDaySpan(event("inside", 11, 12), 10, 13, null)).toMatchObject({
      startCol: 2,
      endCol: 4,
      isStart: true,
      isEnd: true,
    })
  })

  it("returns null when the event does not overlap the range", () => {
    expect(buildAllDaySpan(event("before", 7, 9), 10, 13, null)).toBeNull()
    expect(buildAllDaySpan(event("after", 14, 16), 10, 13, null)).toBeNull()
  })
})

describe("assignAllDayLanes", () => {
  it("packs non-overlapping spans together and separates overlaps", () => {
    const items = [
      buildAllDaySpan(event("later", 11, 13), 10, 13, null)!,
      buildAllDaySpan(event("earlier", 10, 12), 10, 13, null)!,
      buildAllDaySpan(event("tail", 13, 13), 10, 13, null)!,
    ]

    expect(assignAllDayLanes(items, 4)).toBe(1)
    expect(items.map(({ event: itemEvent, lane }) => [itemEvent.id, lane])).toEqual([
      ["earlier", 0],
      ["later", 1],
      ["tail", 0],
    ])
  })
})
