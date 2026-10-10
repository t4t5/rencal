// @vitest-environment happy-dom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import { getStoredEvent, splitRecurringSeriesAt } from "@/lib/api/internal"
import type { CalendarEvent, Recurrence } from "@/lib/cal-events"
import { computeEventDateInfo, formatDateKey, type EventTime } from "@/lib/event-time"
import { fromRpcEventTime } from "@/lib/event-time/rpc"
import { updateAndSyncEvent } from "@/lib/save-event"

import { RecurrenceEditProvider, useRecurrenceEdit } from "./RecurrenceEditContext"

vi.mock("@/contexts/CalEventsContext", () => ({
  useCalEvents: () => ({ setCalendarEvents: vi.fn(), reloadEvents: vi.fn() }),
}))
vi.mock("@/contexts/CalendarStateContext", () => ({ useCalendars: () => ({ calendars: [] }) }))
vi.mock("@/contexts/SyncContext", () => ({ useSync: () => ({ requestSync: vi.fn() }) }))
vi.mock("@/lib/api/internal", () => ({ getStoredEvent: vi.fn(), splitRecurringSeriesAt: vi.fn() }))
vi.mock("@/lib/save-event", () => ({ updateAndSyncEvent: vi.fn() }))

const date = (value: string): EventTime => fromRpcEventTime({ kind: "date", date: value })
const rule = (rrule: string, exdates: EventTime[] = []): Recurrence => ({
  rrule,
  exdates,
  rdates: [],
})

// A Mon–Thu series starting Monday 2026-10-05, opened on Wednesday 10-14.
const exdate = date("2026-10-07")
const oldRule = rule("FREQ=WEEKLY;BYDAY=MO,TU,WE,TH", [exdate])

function event(overrides: Partial<CalendarEvent>): CalendarEvent {
  const start = overrides.start ?? date("2026-10-05")
  const end = overrides.end ?? date("2026-10-06")
  return {
    id: "series",
    recurring_event_id: null,
    summary: "Standup",
    description: null,
    location: null,
    url: null,
    status: "confirmed",
    recurrence: null,
    master_recurrence: null,
    reminders: [],
    organizer: null,
    attendees: [],
    conference: null,
    calendar_slug: "work",
    color: null,
    updated: null,
    ...overrides,
    start,
    end,
    dateInfo: computeEventDateInfo(start, end),
  }
}

const master = event({ recurrence: oldRule })
const occurrence = event({
  id: "series-20261014",
  recurring_event_id: "series",
  start: date("2026-10-14"),
  end: date("2026-10-15"),
  master_recurrence: oldRule,
})

let root: Root
let requestSave: ReturnType<typeof useRecurrenceEdit>["requestSave"]

function Capture() {
  requestSave = useRecurrenceEdit().requestSave
  return null
}

beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  vi.mocked(getStoredEvent).mockResolvedValue(master)
  const container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <RecurrenceEditProvider>
        <Capture />
      </RecurrenceEditProvider>,
    ),
  )
})

afterEach(async () => {
  await act(async () => root.unmount())
  document.body.replaceChildren()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

const button = (label: string) =>
  Array.from(document.querySelectorAll("button")).find((b) => b.textContent?.trim() === label)

const edit = async (newRule: Recurrence | null) => {
  await act(async () => requestSave({ ...occurrence, master_recurrence: newRule }, occurrence))
}

it("applies a changed rule to all events, keeping exceptions", async () => {
  await edit(rule("FREQ=WEEKLY;BYDAY=MO,TU,TH"))
  await act(async () => button("All events")!.click())

  const [saved] = vi.mocked(updateAndSyncEvent).mock.calls[0]
  expect(saved.recurrence).toEqual(rule("FREQ=WEEKLY;BYDAY=MO,TU,TH", [exdate]))
  expect(formatDateKey(saved.start)).toBe("2026-10-05")
})

it("moves the series start onto the new rule's first day", async () => {
  await edit(rule("FREQ=WEEKLY;BYDAY=TU,TH"))
  await act(async () => button("All events")!.click())

  const [saved] = vi.mocked(updateAndSyncEvent).mock.calls[0]
  expect(formatDateKey(saved.start)).toBe("2026-10-06")
  expect(formatDateKey(saved.end)).toBe("2026-10-07")
})

it("splits future events with the new rule", async () => {
  vi.mocked(splitRecurringSeriesAt).mockResolvedValue(occurrence)
  await edit(rule("FREQ=WEEKLY;INTERVAL=2"))
  await act(async () => button("This and future events")!.click())

  expect(splitRecurringSeriesAt).toHaveBeenCalledWith(
    expect.objectContaining({ new_recurrence: rule("FREQ=WEEKLY;INTERVAL=2") }),
  )
})

it("stops repeating from an occurrence on", async () => {
  vi.mocked(splitRecurringSeriesAt).mockResolvedValue(occurrence)
  await edit(null)
  await act(async () => button("This and future events")!.click())

  expect(splitRecurringSeriesAt).toHaveBeenCalledWith(
    expect.objectContaining({ new_recurrence: null }),
  )
})

it("only offers 'Only this event' when the rule is unchanged", async () => {
  await edit(rule("FREQ=WEEKLY"))
  expect(button("Only this event")).toBeUndefined()
  await act(async () => button("Cancel")?.click())

  await act(async () => requestSave({ ...occurrence, summary: "Sync" }, occurrence))
  expect(button("Only this event")).toBeDefined()
})
