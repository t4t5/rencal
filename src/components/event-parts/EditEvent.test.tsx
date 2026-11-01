// @vitest-environment happy-dom
import { Temporal } from "@js-temporal/polyfill"
import { act, type ComponentProps } from "react"
import { createRoot } from "react-dom/client"
import { expect, it, vi } from "vitest"

import type { EventInfo } from "@/components/event-parts/EventInfo"

import type { CalendarEvent } from "@/lib/cal-events"
import { allDayDate, computeEventDateInfo } from "@/lib/event-time"

import { EditEvent } from "./EditEvent"

vi.mock("@/components/event-parts/EventInfo", () => ({
  EventInfo: ({ availability, onAvailabilityChange }: ComponentProps<typeof EventInfo>) => (
    <select
      aria-label="Show as"
      value={availability}
      onChange={(e) => onAvailabilityChange(e.target.value as "busy" | "free")}
    >
      <option value="busy">Busy</option>
      <option value="free">Free</option>
    </select>
  ),
}))
vi.mock("@/contexts/CalEventsContext", () => ({
  useCalEvents: () => ({ setActiveEventKey: vi.fn() }),
}))
vi.mock("@/contexts/CalendarStateContext", () => ({
  useCalendars: () => ({ calendars: [{ slug: "work", read_only: false }] }),
}))
vi.mock("@/contexts/DeleteEventContext", () => ({
  useDeleteEvent: () => ({ triggerDelete: vi.fn() }),
}))
vi.mock("@/contexts/DuplicateEventContext", () => ({
  useDuplicateEvent: () => ({ triggerDuplicate: vi.fn() }),
}))
vi.mock("@/contexts/SyncContext", () => ({ useSync: () => ({ requestSync: vi.fn() }) }))

it.each(["busy", "free"] as const)(
  "loads a %s event and saves the changed availability when closed",
  async (availability) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
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
    const saved = vi.fn()
    const container = document.createElement("div")
    document.body.append(container)
    const root = createRoot(container)
    try {
      await act(async () => root.render(<EditEvent event={event} onRequestSave={saved} />))
      const input = document.querySelector<HTMLSelectElement>('[aria-label="Show as"]')!
      expect(input.value).toBe(availability)
      const next = availability === "busy" ? "free" : "busy"
      await act(async () => {
        input.value = next
        input.dispatchEvent(new Event("change", { bubbles: true }))
      })
      await act(async () => root.unmount())
      expect(saved).toHaveBeenCalledWith(expect.objectContaining({ availability: next }), event)
    } finally {
      container.remove()
      vi.unstubAllGlobals()
    }
  },
)
