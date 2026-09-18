// @vitest-environment happy-dom
import { Temporal } from "@js-temporal/polyfill"
import { act, useEffect } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { getCalendarEventsForRange } from "@/lib/api/calendar-events"
import { rpcToCalendarEvent, type CalendarEvent } from "@/lib/cal-events"

import { CalEventsProvider, useCalEvents } from "./CalEventsContext"

const selection = vi.hoisted(() => ({ ids: ["work"] }))
const registerLoadEventsForDate = vi.hoisted(() => vi.fn())

vi.mock("@/contexts/CalendarStateContext", () => ({
  useCalendars: () => ({ isLoadingCalendars: false }),
  useCalendarNavigation: () => ({
    activeDate: Temporal.PlainDate.from("2026-09-18"),
    registerLoadEventsForDate,
  }),
}))
vi.mock("@/contexts/SettingsContext", () => ({
  useSettings: () => ({ settingsLoaded: true }),
}))
vi.mock("@/hooks/cal-events/useVisibleCalendarIds", () => ({
  useVisibleCalendarIds: () => selection.ids,
}))
vi.mock("@/hooks/useEventDeepLinks", () => ({ useEventDeepLinks: () => {} }))
vi.mock("@/lib/api/events", () => ({
  listenAppEvent: () => ({ ready: Promise.resolve(), unlisten: () => {} }),
}))
vi.mock("@/lib/api/calendar-events", () => ({ getCalendarEventsForRange: vi.fn() }))

function event(id: string, calendarSlug: string): CalendarEvent {
  return rpcToCalendarEvent({
    id,
    calendar_slug: calendarSlug,
    summary: id,
    start: { kind: "date", date: "2026-09-18" },
    end: { kind: "date", date: "2026-09-19" },
    status: "confirmed",
    recurring_event_id: null,
    description: null,
    location: null,
    url: null,
    recurrence: null,
    master_recurrence: null,
    reminders: [],
    organizer: null,
    attendees: [],
    conference: null,
    color: null,
    updated: null,
  })
}

const initialRange = {
  start: Temporal.PlainDate.from("2026-09-01"),
  end: Temporal.PlainDate.from("2026-10-01"),
}
const initialEvents = [event("initial", "work")]
const fetchEvents = vi.mocked(getCalendarEventsForRange)
let root: Root
let context: ReturnType<typeof useCalEvents>
let committedEvents: string[][]

function Consumer() {
  context = useCalEvents()
  const { calendarEvents } = context
  useEffect(() => {
    committedEvents.push(calendarEvents.map((event) => event.id))
  }, [calendarEvents])
  return null
}

async function render() {
  await act(async () => {
    root.render(
      <CalEventsProvider initialEvents={initialEvents} initialRange={initialRange}>
        <Consumer />
      </CalEventsProvider>,
    )
  })
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  selection.ids = ["work"]
  fetchEvents.mockReset()
  committedEvents = []
  root = createRoot(document.createElement("div"))
})

afterEach(async () => {
  await act(async () => root.unmount())
  vi.unstubAllGlobals()
})

describe.each(["reload", "prepend", "append"] as const)("calendar changes during %s", (mode) => {
  const desired = {
    start: mode === "prepend" ? initialRange.start.subtract({ months: 1 }) : initialRange.start,
    end: mode === "append" ? initialRange.end.add({ months: 1 }) : initialRange.end,
  }

  function load() {
    return mode === "reload"
      ? context.reloadEvents()
      : context.ensureRangeLoaded(desired.start, desired.end)
  }

  it("discards the old response and refetches the whole range for the latest calendars", async () => {
    const oldRequest = Promise.withResolvers<CalendarEvent[]>()
    const newRequest = Promise.withResolvers<CalendarEvent[]>()
    fetchEvents.mockReturnValueOnce(oldRequest.promise).mockReturnValueOnce(newRequest.promise)
    await render()

    const pending = load()
    expect(fetchEvents).toHaveBeenCalledTimes(1)
    expect(fetchEvents.mock.calls[0][0]).toEqual(["work"])

    selection.ids = ["personal"]
    await render()
    expect(fetchEvents).toHaveBeenCalledTimes(1)

    await act(async () => oldRequest.resolve([event("stale", "work")]))
    expect(fetchEvents).toHaveBeenCalledTimes(2)
    expect(fetchEvents).toHaveBeenLastCalledWith(["personal"], desired.start, desired.end)
    expect(committedEvents).toEqual([["initial"]])

    await act(async () => {
      newRequest.resolve([event("latest", "personal")])
      await pending
    })
    expect(context.calendarEvents.map((event) => event.id)).toEqual(["latest"])
    expect(committedEvents).toEqual([["initial"], ["latest"]])
    expect(context.loadedRangeRef.current).toEqual(desired)
  })

  it("keeps an empty selection empty when the old response arrives", async () => {
    const oldRequest = Promise.withResolvers<CalendarEvent[]>()
    fetchEvents.mockReturnValueOnce(oldRequest.promise)
    await render()

    const pending = load()
    selection.ids = []
    await render()
    expect(context.calendarEvents).toEqual([])

    await act(async () => {
      oldRequest.resolve([event("stale", "work")])
      await pending
    })
    expect(context.calendarEvents).toEqual([])
    expect(committedEvents).toEqual([["initial"], []])
    expect(fetchEvents).toHaveBeenCalledTimes(1)

    // Restoring a selection must still load the entire desired range.
    fetchEvents.mockResolvedValueOnce([event("restored", "personal")])
    selection.ids = ["personal"]
    await render()
    expect(fetchEvents).toHaveBeenLastCalledWith(["personal"], desired.start, desired.end)
    expect(context.calendarEvents.map((event) => event.id)).toEqual(["restored"])
  })
})
