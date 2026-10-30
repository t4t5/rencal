import { describe, expect, it } from "vitest"

import { DAY_MINUTES } from "@/lib/event-time"

import { layoutTimedOverlaps, type TimedBox } from "./timed-overlaps"

type Layout = TimedBox & { id: string }

/** An event from `start` to `end`, given as "HH:MM". */
function layout(id: string, start: string, end: string): Layout {
  const minutes = (time: string) => {
    const [h, m] = time.split(":").map(Number)
    return h * 60 + m
  }
  const top = (minutes(start) / DAY_MINUTES) * 100
  return {
    id,
    top,
    height: (minutes(end) / DAY_MINUTES) * 100 - top,
    left: 0,
    width: 1,
    coveredWidth: 0,
  }
}

const round = (n: number) => Math.round(n * 1000) / 1000

/** [left, width, coveredWidth] by id. */
function boxesById(layouts: Layout[]) {
  return Object.fromEntries(
    layouts.map((l) => [l.id, [round(l.left), round(l.width), round(l.coveredWidth)]]),
  )
}

const paintOrder = (layouts: Layout[]) => layouts.map((l) => l.id)

describe("layoutTimedOverlaps", () => {
  it("places events starting together side by side, each under its right neighbour", () => {
    const layouts = [layout("a", "09:00", "10:00"), layout("b", "09:00", "10:00")]
    layoutTimedOverlaps(layouts)

    expect(boxesById(layouts)).toEqual({ a: [0, 0.7, 0.2], b: [0.5, 0.5, 0] })
    expect(paintOrder(layouts)).toEqual(["a", "b"])
  })

  it("puts the longer of two same-start events on the left", () => {
    const layouts = [layout("short", "14:00", "15:00"), layout("long", "14:00", "16:30")]
    layoutTimedOverlaps(layouts)

    expect(boxesById(layouts)).toEqual({ long: [0, 0.7, 0.2], short: [0.5, 0.5, 0] })
  })

  it("keeps events that only touch at full width", () => {
    const layouts = [layout("a", "09:00", "10:00"), layout("b", "10:00", "11:00")]
    layoutTimedOverlaps(layouts)

    expect(boxesById(layouts)).toEqual({ a: [0, 1, 0], b: [0, 1, 0] })
  })

  it("nests events starting later on top of a full-width block", () => {
    const layouts = [
      layout("work", "09:00", "17:00"),
      layout("standup", "10:00", "10:30"),
      layout("lunch", "13:00", "14:00"),
    ]
    layoutTimedOverlaps(layouts)

    expect(boxesById(layouts)).toEqual({
      work: [0, 1, 0],
      standup: [0.1, 0.9, 0],
      lunch: [0.1, 0.9, 0],
    })
    expect(paintOrder(layouts)).toEqual(["work", "standup", "lunch"])
  })

  it("splits only the nested area between events starting together inside a block", () => {
    const layouts = [
      layout("work", "09:00", "17:00"),
      layout("a", "10:00", "11:00"),
      layout("b", "10:00", "11:00"),
    ]
    layoutTimedOverlaps(layouts)

    expect(boxesById(layouts)).toEqual({
      work: [0, 1, 0],
      a: [0.1, 0.63, 0.18],
      b: [0.55, 0.45, 0],
    })
  })

  it("indents each step of a staggered chain past the one beneath", () => {
    const layouts = [
      layout("a", "09:00", "10:30"),
      layout("b", "10:00", "11:30"),
      layout("c", "10:45", "12:00"),
    ]
    layoutTimedOverlaps(layouts)

    expect(boxesById(layouts)).toEqual({ a: [0, 1, 0], b: [0.1, 0.9, 0], c: [0.2, 0.8, 0] })
  })

  it("stops nesting at half the width", () => {
    const layouts = Array.from({ length: 8 }, (_, i) =>
      layout(`e${i}`, `${String(9 + i).padStart(2, "0")}:00`, "18:00"),
    )
    layoutTimedOverlaps(layouts)

    expect(layouts.map((l) => round(l.left))).toEqual([0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.5, 0.5])
  })

  it("widens an event into columns left free for its whole span", () => {
    const layouts = [
      layout("a", "09:00", "10:00"),
      layout("b", "09:00", "09:20"),
      layout("c", "09:10", "09:20"),
      // Reuses b's column; c's column is free after 09:20, so d takes it too.
      layout("d", "09:25", "10:00"),
    ]
    layoutTimedOverlaps(layouts)

    expect(boxesById(layouts)).toEqual({
      a: [0, 0.467, 0.133],
      b: [0.333, 0.467, 0.133],
      c: [0.667, 0.333, 0],
      d: [0.333, 0.667, 0],
    })
  })

  it("lays out separate overlap groups independently", () => {
    const layouts = [
      layout("a", "15:00", "16:00"),
      layout("b", "15:00", "16:00"),
      layout("later", "18:00", "19:00"),
    ]
    layoutTimedOverlaps(layouts)

    expect(boxesById(layouts).later).toEqual([0, 1, 0])
  })
})
