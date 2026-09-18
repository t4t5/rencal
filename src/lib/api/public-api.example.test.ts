// @vitest-environment happy-dom
import { Temporal } from "@js-temporal/polyfill"
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks"
import { afterEach, expect, it } from "vitest"

import { api } from "@/lib/api"

afterEach(clearMocks)

it("creates an event through the public resource client", async () => {
  mockIPC((cmd) => {
    if (cmd !== "TauRPC__caldir.create_event") throw new Error(`Unexpected command ${cmd}`)
    return {
      id: "design-review",
      recurring_event_id: null,
      summary: "Design review",
      description: null,
      location: null,
      url: null,
      start: { kind: "date", date: "2026-09-18" },
      end: { kind: "date", date: "2026-09-19" },
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
    }
  })

  const created = await api.events.create({
    calendar_slug: "work",
    summary: "Design review",
    start: { kind: "date", value: Temporal.PlainDate.from("2026-09-18") },
    end: { kind: "date", value: Temporal.PlainDate.from("2026-09-19") },
  })

  expect(created).toMatchObject({
    id: "design-review",
    calendar_slug: "work",
    summary: "Design review",
  })
})
