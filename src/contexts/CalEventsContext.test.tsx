// @vitest-environment happy-dom
import { Temporal } from "@js-temporal/polyfill"
import { act, useEffect } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { api } from "@/lib/api"
import { rpcToCalendarEvent, type CalendarEvent } from "@/lib/cal-events"

import { CalEventsProvider, useCalEvents, useHoldRange } from "./CalEventsContext"

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
vi.mock("@/lib/api", () => ({
  api: {
    events: { list: vi.fn() },
    notifications: {
      listen: () => ({ ready: Promise.resolve(), unlisten: () => {} }),
    },
  },
}))

function event(id: string, calendarSlug: string, date = "2026-09-18"): CalendarEvent {
  return rpcToCalendarEvent({
    id,
    calendar_slug: calendarSlug,
    summary: id,
    start: { kind: "date", date },
    end: { kind: "date", date: Temporal.PlainDate.from(date).add({ days: 1 }).toString() },
    status: "confirmed",
    availability: "busy",
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
const fetchEvents = vi.mocked(api.events.list)
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

function Holder({ range }: { range: { start: Temporal.PlainDate; end: Temporal.PlainDate } }) {
  useHoldRange(range.start, range.end)
  return null
}

async function render(held: { start: Temporal.PlainDate; end: Temporal.PlainDate }[] = []) {
  await act(async () => {
    root.render(
      <CalEventsProvider initialEvents={initialEvents} initialRange={initialRange}>
        <Consumer />
        {held.map((range) => (
          <Holder key={range.start.toString()} range={range} />
        ))}
      </CalEventsProvider>,
    )
  })
}

const range = (start: string, end: string) => ({
  start: Temporal.PlainDate.from(start),
  end: Temporal.PlainDate.from(end),
})

const fetchedRanges = () =>
  fetchEvents.mock.calls.map(([{ range }]) => `${range.start}..${range.end}`)

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
    return mode === "reload" ? context.reloadEvents() : context.extendActiveRange(() => desired)
  }

  it("discards the old response and refetches the whole range for the latest calendars", async () => {
    const oldRequest = Promise.withResolvers<CalendarEvent[]>()
    const newRequest = Promise.withResolvers<CalendarEvent[]>()
    fetchEvents.mockReturnValueOnce(oldRequest.promise).mockReturnValueOnce(newRequest.promise)
    await render()

    const pending = load()
    expect(fetchEvents).toHaveBeenCalledTimes(1)
    expect(fetchEvents.mock.calls[0][0].calendar_slugs).toEqual(["work"])

    selection.ids = ["personal"]
    await render()
    expect(fetchEvents).toHaveBeenCalledTimes(1)

    await act(async () => oldRequest.resolve([event("stale", "work")]))
    expect(fetchEvents).toHaveBeenCalledTimes(2)
    expect(fetchEvents).toHaveBeenLastCalledWith({
      calendar_slugs: ["personal"],
      range: desired,
    })
    expect(committedEvents).toEqual([["initial"]])

    await act(async () => {
      newRequest.resolve([event("latest", "personal")])
      await pending
    })
    expect(context.calendarEvents.map((event) => event.id)).toEqual(["latest"])
    expect(committedEvents).toEqual([["initial"], ["latest"]])
    expect(context.activeRange).toEqual(desired)
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
    expect(fetchEvents).toHaveBeenLastCalledWith({
      calendar_slugs: ["personal"],
      range: desired,
    })
    expect(context.calendarEvents.map((event) => event.id)).toEqual(["restored"])
  })
})

describe("held ranges", () => {
  const far = range("2020-01-01", "2021-01-01")

  it("loads a far range without the months in between", async () => {
    fetchEvents.mockResolvedValue([])
    await render([far])
    expect(fetchedRanges()).toEqual(["2020-01-01..2021-01-01"])
  })

  it("loads only the part of a held range that isn't covered yet", async () => {
    fetchEvents.mockResolvedValue([])
    await render([range("2026-09-15", "2026-10-15")])
    expect(fetchedRanges()).toEqual(["2026-10-01..2026-10-15"])
  })

  it("reloads only what's still held, dropping released ranges", async () => {
    fetchEvents.mockResolvedValueOnce([event("old", "work", "2020-06-01")])
    await render([far])
    expect(context.calendarEvents.map((event) => event.id)).toEqual(["old", "initial"])

    await render()
    // Released ranges stay cached until the next reload.
    expect(context.calendarEvents.map((event) => event.id)).toEqual(["old", "initial"])

    fetchEvents.mockClear()
    fetchEvents.mockResolvedValueOnce([event("initial", "work")])
    await act(() => context.reloadEvents())
    expect(fetchedRanges()).toEqual(["2026-09-01..2026-10-01"])
    expect(context.calendarEvents.map((event) => event.id)).toEqual(["initial"])
  })

  it("reloads every held range", async () => {
    fetchEvents.mockResolvedValue([])
    await render([far])
    fetchEvents.mockClear()
    await act(() => context.reloadEvents())
    expect(fetchedRanges()).toEqual(["2020-01-01..2021-01-01", "2026-09-01..2026-10-01"])
  })
})

describe("jump navigation", () => {
  const loadEventsForDate = (date: string) => {
    const load = registerLoadEventsForDate.mock.calls.at(-1)![0]
    return act(() => load(Temporal.PlainDate.from(date)))
  }

  it("extends the active range for a nearby date", async () => {
    fetchEvents.mockResolvedValue([])
    await render()
    await loadEventsForDate("2026-11-10")
    expect(fetchedRanges()).toEqual(["2026-10-01..2027-02-01"])
    expect(context.activeRange).toEqual(range("2026-09-01", "2027-02-01"))
  })

  it("moves the active range for a far date and lists only its events", async () => {
    fetchEvents.mockResolvedValue([event("far", "work", "2020-06-01")])
    await render()
    await loadEventsForDate("2020-06-01")
    expect(fetchedRanges()).toEqual(["2020-04-01..2020-09-01"])
    expect(context.activeRange).toEqual(range("2020-04-01", "2020-09-01"))

    fetchEvents.mockClear()
    fetchEvents.mockResolvedValueOnce([event("far", "work", "2020-06-01")])
    await act(() => context.reloadEvents())
    expect(fetchedRanges()).toEqual(["2020-04-01..2020-09-01"])
    expect(context.calendarEvents.map((event) => event.id)).toEqual(["far"])
  })
})
