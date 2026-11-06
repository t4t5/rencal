// @vitest-environment happy-dom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import type { CalendarEvent } from "@/lib/cal-events"
import { draftToCalendarEvent } from "@/lib/draft-to-event"

import { EventDraftProvider, useEventDraft } from "./EventDraftContext"

const mocks = vi.hoisted(() => ({ create: vi.fn(), setEvents: vi.fn(), sync: vi.fn() }))
vi.mock("@/lib/api", () => ({
  api: { events: { create: mocks.create } },
  getErrorMessage: () => "failed",
}))
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn() } }))
vi.mock("@/contexts/CalEventsContext", () => ({
  useCalEvents: () => ({ setCalendarEvents: mocks.setEvents, reloadEvents: vi.fn() }),
}))
vi.mock("@/contexts/CalendarStateContext", () => ({
  useCalendars: () => ({ calendars: [{ slug: "work", read_only: false }] }),
}))
vi.mock("@/contexts/SettingsContext", () => ({
  useSettings: () => ({ defaultCalendar: "work", defaultReminders: [] }),
}))
vi.mock("@/contexts/SyncContext", () => ({ useSync: () => ({ requestSync: mocks.sync }) }))

let root: Root
let draft: ReturnType<typeof useEventDraft>
function Consumer() {
  draft = useEventDraft()
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
      <EventDraftProvider>
        <Consumer />
      </EventDraftProvider>,
    ),
  )
})
afterEach(async () => {
  await act(async () => root.unmount())
  document.body.replaceChildren()
  vi.unstubAllGlobals()
})

it("defaults new drafts to busy and resets the choice for the next event", async () => {
  expect(draft.draftEvent.availability).toBe("busy")
  await act(async () => draft.setDraftEvent({ ...draft.draftEvent, availability: "free" }))
  await act(async () => draft.setDefaultDraftEvent())
  expect(draft.draftEvent.availability).toBe("busy")
})

it("uses the selected availability in the preview, optimistic event, and create request", async () => {
  await act(async () =>
    draft.setDraftEvent({ ...draft.draftEvent, summary: "Available", availability: "free" }),
  )
  const preview = draftToCalendarEvent(draft.draftEvent)!
  expect(preview.availability).toBe("free")
  mocks.create.mockResolvedValue({ ...preview, id: "stored" })
  await act(async () => draft.createDraftEvent())
  expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ availability: "free" }))
  const optimistic = mocks.setEvents.mock.calls[0][0]([]) as CalendarEvent[]
  expect(optimistic[0].availability).toBe("free")
  expect(draft.draftEvent.availability).toBe("busy")
})
