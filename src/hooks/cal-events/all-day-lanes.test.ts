import { describe, expect, it } from "vitest"

import { assignAllDayLanes, clipSpanToRange } from "./all-day-lanes"

function span(id: string, firstDay: number, lastDay: number) {
  return { id, ...clipSpanToRange(firstDay, lastDay, 10, 13)!, lane: 0 }
}

describe("assignAllDayLanes", () => {
  it("packs non-overlapping spans together and separates overlaps", () => {
    const items = [span("later", 11, 13), span("earlier", 10, 12), span("tail", 13, 13)]

    expect(assignAllDayLanes(items, 4)).toBe(1)
    expect(items.map(({ id, lane }) => [id, lane])).toEqual([
      ["earlier", 0],
      ["later", 1],
      ["tail", 0],
    ])
  })
})

describe("clipSpanToRange", () => {
  it("keeps spans inside the range", () => {
    expect(clipSpanToRange(11, 12, 10, 13)).toEqual({
      startCol: 2,
      endCol: 4,
      isStart: true,
      isEnd: true,
    })
  })

  it("clips both ends", () => {
    expect(clipSpanToRange(8, 15, 10, 13)).toEqual({
      startCol: 1,
      endCol: 5,
      isStart: false,
      isEnd: false,
    })
  })

  it("returns null outside the range", () => {
    expect(clipSpanToRange(7, 9, 10, 13)).toBeNull()
    expect(clipSpanToRange(14, 16, 10, 13)).toBeNull()
  })
})

describe("assignAllDayLanes with a create selection", () => {
  it("gives the selection the same priority as an appended draft event", () => {
    const items = [
      { id: "existing-long", startCol: 1, endCol: 6, isStart: true, isEnd: true, lane: 0 },
      { id: "existing-short", startCol: 2, endCol: 4, isStart: true, isEnd: true, lane: 0 },
      { id: "selection", startCol: 1, endCol: 8, isStart: true, isEnd: true, lane: 0 },
    ]

    assignAllDayLanes(items, 7)

    expect(items.map(({ id, lane }) => [id, lane])).toEqual([
      ["selection", 0],
      ["existing-long", 1],
      ["existing-short", 2],
    ])
  })
})
