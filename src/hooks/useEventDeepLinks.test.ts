import { describe, expect, it, vi } from "vitest"

import type { CalendarEvent as RpcCalendarEvent, EventDeepLink } from "@/rpc/bindings"

import { createEventDeepLinkDrainer } from "@/lib/event-deep-link-drainer"

function rpcEvent(id: string): RpcCalendarEvent {
  return {
    id,
    recurring_event_id: null,
    summary: id,
    description: null,
    location: null,
    start: { kind: "date", date: "2026-08-26" },
    end: { kind: "date", date: "2026-08-27" },
    status: "confirmed",
    recurrence: null,
    master_recurrence: null,
    reminders: [],
    organizer: null,
    attendees: [],
    conference: null,
    calendar_slug: "calendar",
    color: null,
    updated: null,
  }
}

const first: EventDeepLink = { uid: "first", recurrence_id: null }
const second: EventDeepLink = { uid: "second", recurrence_id: "20260826" }

describe("event deep-link drainer", () => {
  it("processes links in order and never processes a drained link twice", async () => {
    let takeCount = 0
    const opened: string[] = []
    const drain = createEventDeepLinkDrainer({
      takePending: async () => (takeCount++ === 0 ? [first, second] : []),
      findEvent: async (link) => rpcEvent(link.uid),
      jumpToEvent: async (event) => {
        opened.push(event.id)
      },
      onNotFound: vi.fn(),
      onError: vi.fn(),
    })

    await Promise.all([drain(), drain(), drain()])
    expect(opened).toEqual(["first", "second"])
  })

  it("does not navigate for not-found or lookup errors", async () => {
    const jumpToEvent = vi.fn()
    const onNotFound = vi.fn()
    const onError = vi.fn()
    const drain = createEventDeepLinkDrainer({
      takePending: async () => [first, second],
      findEvent: async (link) => {
        if (link.uid === "first") return null
        throw new Error("lookup failed")
      },
      jumpToEvent,
      onNotFound,
      onError,
    })

    await drain()
    expect(jumpToEvent).not.toHaveBeenCalled()
    expect(onNotFound).toHaveBeenCalledOnce()
    expect(onError).toHaveBeenCalledOnce()
  })
})
