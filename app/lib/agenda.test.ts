import { Temporal } from "@js-temporal/polyfill"

import {
  agendaItems,
  buildAgendaRows,
  headerIndexOf,
  keepUnchangedRows,
  rowIndexOf,
  stepAgendaItem,
  timeLabelKind,
} from "@/lib/agenda"
import { eventKey, type CalendarEvent } from "@/lib/cal-events"
import {
  allDayDate,
  atTime,
  computeEventDateInfo,
  epochDay,
  type EventTime,
} from "@/lib/event-time"
import { describe, expect, it } from "@/lib/testing/vitest"

const at = (date: string, hour: number) => atTime(Temporal.PlainDate.from(date), hour)

function makeEvent(id: string, start: EventTime, end: EventTime): CalendarEvent {
  return {
    id,
    calendar_slug: "work",
    summary: id,
    start,
    end,
    dateInfo: computeEventDateInfo(start, end),
    attendees: [],
    recurrence: null,
    master_recurrence: null,
    conference: null,
  } as unknown as CalendarEvent
}

const meeting = (id: string, date: string) => makeEvent(id, at(date, 10), at(date, 11))
const holiday = (id: string, date: string) => {
  const day = Temporal.PlainDate.from(date)
  return makeEvent(id, allDayDate(day), allDayDate(day.add({ days: 1 })))
}
const dayOf = (date: string) => epochDay(Temporal.PlainDate.from(date))

describe("buildAgendaRows", () => {
  it("lists a day's chips before its timed events, closing the section on its last row", () => {
    const rows = buildAgendaRows([meeting("standup", "2026-11-02"), holiday("party", "2026-11-02")])
    expect(rows.map((row) => row.kind)).toEqual(["header", "all-day", "timed"])
    expect(rows.map((row) => row.last)).toEqual([false, false, true])
  })

  it("sorts days and shows a timed event spanning days as a chip on the days it covers", () => {
    const trip = makeEvent("trip", at("2026-11-02", 18), at("2026-11-04", 9))
    const rows = buildAgendaRows([trip])
    expect(rows.map((row) => row.kind)).toEqual([
      "header",
      "timed",
      "header",
      "all-day",
      "header",
      "timed",
    ])
    expect(rows[0]!.day).toBe(dayOf("2026-11-02"))
    expect(rows[4]!.day).toBe(dayOf("2026-11-04"))
  })

  it("adds an empty section for the ghost day, in date order", () => {
    const rows = buildAgendaRows(
      [meeting("a", "2026-11-01"), meeting("b", "2026-11-05")],
      dayOf("2026-11-03"),
    )
    expect(rows.map((row) => row.kind)).toEqual([
      "header",
      "timed",
      "header",
      "empty",
      "header",
      "timed",
    ])
    expect(headerIndexOf(rows, Temporal.PlainDate.from("2026-11-03"))).toBe(2)
  })

  it("adds no ghost to a day that has events", () => {
    const rows = buildAgendaRows([meeting("a", "2026-11-01")], dayOf("2026-11-01"))
    expect(rows.map((row) => row.kind)).toEqual(["header", "timed"])
  })
})

describe("keepUnchangedRows", () => {
  it("keeps the objects of rows that didn't change", () => {
    const before = buildAgendaRows([meeting("a", "2026-11-01"), meeting("b", "2026-11-02")])
    const renamed = { ...meeting("b", "2026-11-02"), summary: "renamed" }
    const after = keepUnchangedRows(before, buildAgendaRows([meeting("a", "2026-11-01"), renamed]))
    expect(after[1]).toBe(before[1])
    expect(after[3] === before[3]).toBe(false)
    expect(after[2]).toBe(before[2])
  })
})

describe("stepAgendaItem", () => {
  const rows = buildAgendaRows([
    holiday("party", "2026-11-02"),
    meeting("first", "2026-11-02"),
    meeting("second", "2026-11-02"),
    meeting("later", "2026-11-05"),
  ])
  const items = agendaItems(rows)
  const key = (id: string) => eventKey({ id, calendar_slug: "work" })
  const item = (id: string, date: string) => ({ key: key(id), day: dayOf(date) })

  it("starts from the active day's first timed event", () => {
    expect(stepAgendaItem(items, null, 1, dayOf("2026-11-02"))?.key).toBe(key("first"))
  })

  it("starts from the next day with events, or else the last event", () => {
    expect(stepAgendaItem(items, null, 1, dayOf("2026-11-03"))?.key).toBe(key("later"))
    expect(stepAgendaItem(items, null, 1, dayOf("2026-12-01"))?.key).toBe(key("later"))
  })

  it("steps in row order and stops at the ends", () => {
    const first = item("first", "2026-11-02")
    expect(stepAgendaItem(items, first, 1, 0)?.key).toBe(key("second"))
    expect(stepAgendaItem(items, first, -1, 0)?.key).toBe(key("party"))
    expect(stepAgendaItem(items, item("party", "2026-11-02"), -1, 0)?.key).toBe(key("party"))
    expect(stepAgendaItem(items, item("later", "2026-11-05"), 1, 0)?.key).toBe(key("later"))
  })

  it("finds the row an item is on", () => {
    const later = { ...item("later", "2026-11-05"), allDay: false }
    expect(rows[rowIndexOf(rows, later)]?.kind).toBe("timed")
    const party = { ...item("party", "2026-11-02"), allDay: true }
    expect(rows[rowIndexOf(rows, party)]?.kind).toBe("all-day")
  })
})

describe("timeLabelKind", () => {
  it("names the boundary a multi-day row touches", () => {
    const trip = makeEvent("trip", at("2026-11-02", 18), at("2026-11-04", 9))
    expect(timeLabelKind(meeting("a", "2026-11-02"), dayOf("2026-11-02"))).toBe("range")
    expect(timeLabelKind(trip, dayOf("2026-11-02"))).toBe("starts")
    expect(timeLabelKind(trip, dayOf("2026-11-04"))).toBe("ends")
  })
})
