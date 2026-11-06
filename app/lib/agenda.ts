/*
 * The agenda as a flat list of rows, for `List`: a sticky header per day, then
 * the day's all-day chips and timed events. `items` are what keyboard
 * navigation steps through.
 */
import { Temporal } from "@js-temporal/polyfill"

import { eventKey, type CalendarEvent } from "@/lib/cal-events"
import { coversFullDay, epochDay, occupiedDays } from "@/lib/event-time"

type RowBase = {
  /** Stable across rebuilds; also a section's id. */
  key: string
  day: number
  /** Closes the day's section. */
  last: boolean
}

export type AgendaHeaderRow = RowBase & { kind: "header" }
export type AgendaAllDayRow = RowBase & { kind: "all-day"; events: CalendarEvent[] }
export type AgendaTimedRow = RowBase & { kind: "timed"; event: CalendarEvent }
export type AgendaEmptyRow = RowBase & { kind: "empty" }
export type AgendaRow = AgendaHeaderRow | AgendaAllDayRow | AgendaTimedRow | AgendaEmptyRow

/** A selectable row of the agenda: a multi-day event has one on each day. */
export type AgendaItem = { key: string; day: number; allDay: boolean }

function groupByDay(events: readonly CalendarEvent[]): Map<number, CalendarEvent[]> {
  const byDay = new Map<number, CalendarEvent[]>()
  for (const event of events) {
    for (const day of occupiedDays(event.dateInfo)) {
      const list = byDay.get(day)
      if (list) list.push(event)
      else byDay.set(day, [event])
    }
  }
  return byDay
}

/** `ghostDay` keeps a section for a day with no events, so it can be scrolled to. */
export function buildAgendaRows(
  events: readonly CalendarEvent[],
  ghostDay: number | null = null,
): AgendaRow[] {
  const byDay = groupByDay(events)
  if (ghostDay !== null && !byDay.has(ghostDay)) byDay.set(ghostDay, [])

  const rows: AgendaRow[] = []
  for (const [day, dayEvents] of [...byDay.entries()].sort(([a], [b]) => a - b)) {
    rows.push({ kind: "header", key: `${day}`, day, last: false })
    if (dayEvents.length === 0) {
      rows.push({ kind: "empty", key: `${day}:empty`, day, last: false })
    }
    // A timed event covering this whole day (the middle of a multi-day span) is a chip.
    const allDay = dayEvents.filter((event) => coversFullDay(event.start, event.dateInfo, day))
    if (allDay.length > 0) {
      rows.push({ kind: "all-day", key: `${day}:all-day`, day, events: allDay, last: false })
    }
    for (const event of dayEvents) {
      if (coversFullDay(event.start, event.dateInfo, day)) continue
      rows.push({ kind: "timed", key: `${day}:${eventKey(event)}`, day, event, last: false })
    }
    rows[rows.length - 1]!.last = true
  }
  return rows
}

function sameRow(a: AgendaRow, b: AgendaRow) {
  if (a.kind === "timed" && b.kind === "timed" && a.event === b.event) return a.last === b.last
  return JSON.stringify(a) === JSON.stringify(b)
}

/**
 * `List` matches rows by identity, and a reload makes new event objects: keep
 * the old object for a row that hasn't changed, so rows keep their cells.
 */
export function keepUnchangedRows(
  previous: readonly AgendaRow[],
  next: readonly AgendaRow[],
): AgendaRow[] {
  const byKey = new Map(previous.map((row) => [row.key, row]))
  return next.map((row) => {
    const old = byKey.get(row.key)
    return old && sameRow(old, row) ? old : row
  })
}

export function agendaItems(rows: readonly AgendaRow[]): AgendaItem[] {
  return rows.flatMap((row): AgendaItem[] => {
    if (row.kind === "all-day") {
      return row.events.map((event) => ({ key: eventKey(event), day: row.day, allDay: true }))
    }
    if (row.kind === "timed") {
      return [{ key: eventKey(row.event), day: row.day, allDay: false }]
    }
    return []
  })
}

/** The index of the row showing `item`. */
export function rowIndexOf(rows: readonly AgendaRow[], item: AgendaItem): number {
  return rows.findIndex((row) => {
    if (row.day !== item.day) return false
    if (row.kind === "all-day") return row.events.some((event) => eventKey(event) === item.key)
    return row.kind === "timed" && eventKey(row.event) === item.key
  })
}

/** The index of `date`'s header, or -1 with no section for it. */
export function headerIndexOf(rows: readonly AgendaRow[], date: Temporal.PlainDate): number {
  const day = epochDay(date)
  return rows.findIndex((row) => row.kind === "header" && row.day === day)
}

/**
 * Where a step of `delta` lands. From no selection: the active day's first timed
 * event, or else the next day that has events, or else the last event.
 */
export function stepAgendaItem(
  items: readonly AgendaItem[],
  current: { key: string; day: number } | null,
  delta: 1 | -1,
  activeDay: number,
): AgendaItem | null {
  if (items.length === 0) return null

  const index = current
    ? items.findIndex((item) => item.key === current.key && item.day === current.day)
    : -1
  if (index !== -1) return items[Math.min(items.length - 1, Math.max(0, index + delta))]!

  const targetDay = items.some((item) => item.day === activeDay)
    ? activeDay
    : items.find((item) => item.day > activeDay)?.day
  if (targetDay === undefined) return items[items.length - 1]!
  const candidates = items.filter((item) => item.day === targetDay)
  return candidates.find((item) => !item.allDay) ?? candidates[0]!
}

/** A multi-day timed row shows only the boundary it touches. */
export function timeLabelKind(event: CalendarEvent, day: number): "range" | "starts" | "ends" {
  if (event.dateInfo.firstDay === event.dateInfo.endDay) return "range"
  return event.dateInfo.firstDay === day ? "starts" : "ends"
}
