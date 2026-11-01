// @vitest-environment happy-dom
import { Temporal } from "@js-temporal/polyfill"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import type { CalendarEvent } from "@/lib/cal-events"
import { computeEventDateInfo, allDayDate } from "@/lib/event-time"

import { DuplicateEventProvider, useDuplicateEvent } from "./DuplicateEventContext"

const mocks = vi.hoisted(() => ({ setDraftEvent: vi.fn() }))
vi.mock("@/contexts/CalEventsContext", () => ({
  useCalEvents: () => ({ setActiveEventKey: vi.fn() }),
}))
vi.mock("@/contexts/CalendarStateContext", () => ({
  useCalendars: () => ({ calendars: [{ slug: "work", read_only: false }] }),
}))
vi.mock("@/contexts/CreateEventGateContext", () => ({
  useCreateEventGate: () => ({ canCreate: true, promptToConnect: vi.fn() }),
}))
vi.mock("@/contexts/EventDraftContext", () => ({
  useEventDraft: () => ({
    defaultCalendarId: "work",
    setDraftEvent: mocks.setDraftEvent,
    setDraftReminders: vi.fn(),
    setDraftPopoverOpen: vi.fn(),
    setIsDrafting: vi.fn(),
  }),
}))

let root: Root
let duplicate: ReturnType<typeof useDuplicateEvent>["triggerDuplicate"]
function Consumer() {
  duplicate = useDuplicateEvent().triggerDuplicate
  return null
}

beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  vi.clearAllMocks()
  const container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <DuplicateEventProvider>
        <Consumer />
      </DuplicateEventProvider>,
    ),
  )
})
afterEach(async () => {
  await act(async () => root.unmount())
  document.body.replaceChildren()
  vi.unstubAllGlobals()
})

it.each(["busy", "free"] as const)(
  "preserves %s availability in a duplicated draft",
  async (availability) => {
    const start = allDayDate(Temporal.PlainDate.from("2026-11-03"))
    const end = allDayDate(Temporal.PlainDate.from("2026-11-04"))
    const event: CalendarEvent = {
      id: "source",
      recurring_event_id: null,
      summary: "Source",
      description: null,
      location: null,
      url: null,
      start,
      end,
      dateInfo: computeEventDateInfo(start, end),
      status: "confirmed",
      availability,
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
    await act(async () => duplicate(event))
    expect(mocks.setDraftEvent).toHaveBeenCalledWith(expect.objectContaining({ availability }))
  },
)
