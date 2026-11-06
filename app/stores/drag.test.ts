import { Temporal } from "@js-temporal/polyfill"
import { afterEach, describe, expect, test } from "nsh/test"

import type { CalendarEvent } from "@/lib/cal-events"
import { type DayArea, setDayAreas } from "@/lib/day-hits"
import {
  allDayDate,
  atTime,
  computeEventDateInfo,
  formatDateKey,
  wallclockTime,
} from "@/lib/event-time"

import { draftEvent, draftPopoverOpen, closeDraftPopover } from "@/stores/draft"
import {
  activeDrag,
  createSelection,
  displayedEvents,
  dragRole,
  endGesture,
  movePointer,
  setDragScroller,
  startCreateDrag,
  startEventDrag,
} from "@/stores/drag"
import { setCalendarEvents } from "@/stores/events"
import { closeEditDialog, pendingEdit } from "@/stores/recurrence"

let forgetScroller = () => {}

const MONDAY = Temporal.PlainDate.from("2026-11-02")
const day = (offset: number) => MONDAY.add({ days: offset })

/** Seven columns 100 wide; hours 10 high, so 240 for a day, starting at y = 100. */
const timedAreas = (scrolled = 0): DayArea[] =>
  Array.from({ length: 7 }, (_, column) => ({
    day: day(column),
    zone: "timed",
    rect: { x: column * 100, y: 100 - scrolled, width: 100, height: 240 },
    visible: { x: column * 100, y: 100, width: 100, height: 200 },
  }))

const dayCells: DayArea[] = Array.from({ length: 14 }, (_, index) => ({
  day: day(index),
  zone: "day",
  rect: { x: (index % 7) * 100, y: Math.floor(index / 7) * 100, width: 100, height: 100 },
}))

const eventAt = (date: Temporal.PlainDate, hour: number, recurring = false): CalendarEvent => {
  const start = atTime(date, hour)
  const end = atTime(date, hour + 1)
  return {
    id: "event",
    recurring_event_id: recurring ? "series" : null,
    summary: "Standup",
    description: null,
    location: null,
    url: null,
    start,
    end,
    dateInfo: computeEventDateInfo(start, end),
    status: "confirmed",
    availability: "busy",
    recurrence: null,
    master_recurrence: null,
    reminders: [],
    organizer: null,
    attendees: [],
    conference: null,
    calendar_slug: "work",
    color: null,
    updated: null,
  }
}

afterEach(() => {
  endGesture()
  setDayAreas("test", null)
  forgetScroller()
  setCalendarEvents(() => [])
  closeEditDialog()
  closeDraftPopover()
})

describe("drag", () => {
  test("dragging a timed event previews it at the snapped slot of the day under the pointer", () => {
    setDayAreas("test", () => timedAreas())
    const event = eventAt(day(0), 9)
    setCalendarEvents(() => [event])

    // Grabbed on its top edge, in the first column.
    startEventDrag(event, { x: 50, y: 190 }, "block", undefined)
    expect(activeDrag()?.target).toBe(null)

    movePointer({ x: 250, y: 212 })
    const preview = activeDrag()?.preview
    expect(preview && wallclockTime(preview.start)).toEqual({ hour: 11, minute: 15 })
    expect(preview && formatDateKey(preview.start)).toBe("2026-11-04")
    expect(displayedEvents().length).toBe(2)
    expect(dragRole(event)).toBe("source")
    expect(preview && dragRole(preview)).toBe("preview")
  })

  test("dropping a recurring event asks what to change, and leaves no preview behind", () => {
    setDayAreas("test", () => timedAreas())
    const event = eventAt(day(0), 9, true)
    setCalendarEvents(() => [event])

    startEventDrag(event, { x: 50, y: 190 }, "block", undefined)
    movePointer({ x: 150, y: 190 })
    endGesture({ commit: true })

    expect(activeDrag()).toBe(null)
    expect(displayedEvents().length).toBe(1)
    expect(pendingEdit()?.original).toBe(event)
    expect(formatDateKey(pendingEdit()!.current.start)).toBe("2026-11-03")
  })

  test("cancelling a drag saves nothing, and the release finds nothing to do", () => {
    setDayAreas("test", () => timedAreas())
    const event = eventAt(day(0), 9, true)
    setCalendarEvents(() => [event])

    startEventDrag(event, { x: 50, y: 190 }, "block", undefined)
    movePointer({ x: 150, y: 190 })
    endGesture()
    endGesture({ commit: true })

    expect(activeDrag()).toBe(null)
    expect(pendingEdit()).toBe(null)
  })

  test("a drop back on its own slot does nothing", () => {
    setDayAreas("test", () => timedAreas())
    const event = eventAt(day(0), 9, true)
    setCalendarEvents(() => [event])

    startEventDrag(event, { x: 50, y: 190 }, "block", undefined)
    movePointer({ x: 150, y: 190 })
    movePointer({ x: 50, y: 191 })
    expect(activeDrag()?.target).toBe(null)
    endGesture({ commit: true })
    expect(pendingEdit()).toBe(null)
  })

  test("a timed selection stays in its column and snaps to quarters", () => {
    setDayAreas("test", () => timedAreas())
    const [area] = timedAreas()
    startCreateDrag(area!, { x: 50, y: 190 })
    movePointer({ x: 350, y: 201 })

    const selection = createSelection()
    expect(selection?.kind === "timed" && selection.day.equals(day(0))).toBe(true)
    expect(selection?.kind === "timed" && selection.startMinutes).toBe(9 * 60)
    expect(selection?.kind === "timed" && selection.endMinutes).toBe(10 * 60 + 15)
  })

  test("a day selection grows across rows, and the release opens an all-day draft", () => {
    setDayAreas("test", () => dayCells)
    forgetScroller = setDragScroller({
      rect: () => ({ x: 0, y: 0, width: 700, height: 200 }),
      axes: { x: false, y: true },
      scrollBy: () => {},
    })
    startCreateDrag(dayCells[5]!, { x: 550, y: 50 })
    movePointer({ x: 150, y: 150 })

    const selection = createSelection()
    expect(selection?.kind === "days" && selection.firstDay.equals(day(5))).toBe(true)
    expect(selection?.kind === "days" && selection.lastDay.equals(day(8))).toBe(true)

    // No writable calendar here: the draft would prompt to connect, so check it's not open.
    endGesture({ commit: true })
    expect(createSelection()).toBe(null)
    expect(draftPopoverOpen() ? draftEvent().end : allDayDate(day(9))).toEqual(allDayDate(day(9)))
  })
})
