// @vitest-environment happy-dom
import { Temporal } from "@js-temporal/polyfill"
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { CalendarEvent as RpcCalendarEvent } from "@/rpc/bindings"

import { isRenCalError, rencal } from "@/lib/api"
import { getStoredEvent, replaceEvent, splitRecurringSeriesAt } from "@/lib/api/internal"

afterEach(() => {
  clearMocks()
  vi.restoreAllMocks()
})

function rpcEvent(overrides: Partial<RpcCalendarEvent> = {}): RpcCalendarEvent {
  return {
    id: "event",
    recurring_event_id: null,
    summary: "Standup",
    description: null,
    location: null,
    url: null,
    start: { kind: "datetime_zoned", wallclock: "2026-09-18T09:00:00", tzid: "Europe/Berlin" },
    end: { kind: "datetime_zoned", wallclock: "2026-09-18T09:30:00", tzid: "Europe/Berlin" },
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
  }
}

/** Records every invoke and answers each command from `responses`. */
function mockRpc(responses: Record<string, unknown>) {
  const calls: { cmd: string; args: Record<string, unknown> | undefined }[] = []
  mockIPC((cmd, args) => {
    calls.push({ cmd, args: args as Record<string, unknown> | undefined })
    if (!(cmd in responses)) throw new Error(`Unexpected command ${cmd}`)
    return responses[cmd]
  })
  return calls
}

const zoned = (wallclock: string) =>
  ({
    kind: "datetime_zoned",
    value: Temporal.ZonedDateTime.from(`${wallclock}[Europe/Berlin]`),
  }) as const

describe("calendar event reads", () => {
  it("does not interpret an empty calendar selection as all calendars", async () => {
    const calls = mockRpc({})
    const events = await rencal.events.list({
      calendar_slugs: [],
      range: {
        start: Temporal.PlainDate.from("2026-09-18"),
        end: Temporal.PlainDate.from("2026-09-19"),
      },
    })
    expect(events).toEqual([])
    expect(calls).toEqual([])
  })

  it("queries viewer-zone day boundaries as UTC instants and converts the result", async () => {
    const calls = mockRpc({ "TauRPC__caldir.list_events": [rpcEvent()] })
    const events = await rencal.events.list({
      calendar_slugs: ["work"],
      range: {
        start: Temporal.PlainDate.from("2026-09-18"),
        end: Temporal.PlainDate.from("2026-09-19"),
      },
    })
    // The test zone is Europe/Berlin (vite.config.ts), UTC+2 in September.
    expect(calls).toEqual([
      {
        cmd: "TauRPC__caldir.list_events",
        args: {
          calendar_slugs: ["work"],
          start: "2026-09-17T22:00:00Z",
          end: "2026-09-18T22:00:00Z",
        },
      },
    ])
    expect(events).toHaveLength(1)
    expect(events[0].start).toEqual(zoned("2026-09-18T09:00:00"))
    expect(events[0].dateInfo.startMs).toBe(Date.parse("2026-09-18T07:00:00Z"))
  })

  it("skips events that fail to convert instead of rejecting the load", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    mockRpc({
      "TauRPC__caldir.list_events": [
        rpcEvent({
          id: "broken",
          start: { kind: "datetime_zoned", wallclock: "2026-09-18T09:00:00", tzid: "GMT+0100" },
        }),
        rpcEvent({ id: "ok" }),
      ],
    })
    const events = await rencal.events.list({
      calendar_slugs: ["work"],
      range: {
        start: Temporal.PlainDate.from("2026-09-18"),
        end: Temporal.PlainDate.from("2026-09-19"),
      },
    })
    expect(events.map((event) => event.id)).toEqual(["ok"])
    expect(warn).toHaveBeenCalledOnce()
  })

  it("returns null for a missing event and an app event otherwise", async () => {
    mockRpc({ "TauRPC__caldir.get_event": null })
    expect(await getStoredEvent({ calendar_slug: "work", id: "missing" })).toBeNull()

    clearMocks()
    mockRpc({
      "TauRPC__caldir.get_event": rpcEvent({
        recurrence: {
          rrule: "FREQ=DAILY",
          exdates: [{ kind: "date", date: "2026-09-21" }],
          rdates: [],
        },
      }),
    })
    const event = await getStoredEvent({ calendar_slug: "work", id: "event" })
    expect(event?.recurrence).toEqual({
      rrule: "FREQ=DAILY",
      exdates: [{ kind: "date", value: Temporal.PlainDate.from("2026-09-21") }],
      rdates: [],
    })
  })
})

describe("calendar event writes", () => {
  it("applies documented defaults to the minimum creation input", async () => {
    const calls = mockRpc({ "TauRPC__caldir.create_event": rpcEvent({ id: "minimal" }) })
    await rencal.events.create({
      calendar_slug: "work",
      summary: "Standup",
      start: zoned("2026-09-18T09:00:00"),
      end: zoned("2026-09-18T09:30:00"),
    })
    expect(calls[0].args?.input).toEqual(
      expect.objectContaining({
        description: null,
        location: null,
        url: null,
        recurrence: null,
        reminders: [],
        attendees: [],
        conference: null,
      }),
    )
  })

  it("converts create input once and returns the stored event converted once", async () => {
    const calls = mockRpc({ "TauRPC__caldir.create_event": rpcEvent({ id: "stored" }) })
    const created = await rencal.events.create({
      calendar_slug: "work",
      summary: "Standup",
      description: null,
      location: null,
      url: null,
      start: zoned("2026-09-18T09:00:00"),
      end: zoned("2026-09-18T09:30:00"),
      recurrence: {
        rrule: "FREQ=WEEKLY",
        exdates: [zoned("2026-09-25T09:00:00")],
        rdates: [],
      },
      reminders: [10],
      attendees: [{ name: null, email: "a@example.com", response_status: "needs-action" }],
      conference: { status: "requested", provider: "google" },
    })
    expect(calls).toEqual([
      {
        cmd: "TauRPC__caldir.create_event",
        args: {
          input: {
            calendar_slug: "work",
            summary: "Standup",
            description: null,
            location: null,
            url: null,
            start: {
              kind: "datetime_zoned",
              wallclock: "2026-09-18T09:00:00",
              tzid: "Europe/Berlin",
            },
            end: {
              kind: "datetime_zoned",
              wallclock: "2026-09-18T09:30:00",
              tzid: "Europe/Berlin",
            },
            recurrence: {
              rrule: "FREQ=WEEKLY",
              exdates: [
                { kind: "datetime_zoned", wallclock: "2026-09-25T09:00:00", tzid: "Europe/Berlin" },
              ],
              rdates: [],
            },
            reminders: [10],
            attendees: [{ name: null, email: "a@example.com", response_status: "needs-action" }],
            conference: { status: "requested", provider: "google" },
          },
        },
      },
    ])
    expect(created.id).toBe("stored")
    expect(created.start).toEqual(zoned("2026-09-18T09:00:00"))
    expect(created.dateInfo.endMs - created.dateInfo.startMs).toBe(30 * 60_000)
  })

  it("sends update input on the wire shape and resolves without a value", async () => {
    const calls = mockRpc({ "TauRPC__caldir.update_event": null })
    await expect(
      replaceEvent({
        id: "event",
        calendar_slug: "work",
        new_calendar_slug: "personal",
        summary: "Moved",
        description: null,
        location: null,
        url: null,
        start: { kind: "date", value: Temporal.PlainDate.from("2026-09-18") },
        end: { kind: "date", value: Temporal.PlainDate.from("2026-09-19") },
        recurrence: null,
        reminders: [],
        attendees: [],
        conference: null,
      }),
    ).resolves.toBeUndefined()
    expect(calls[0].args).toEqual({
      input: expect.objectContaining({
        new_calendar_slug: "personal",
        start: { kind: "date", date: "2026-09-18" },
        end: { kind: "date", date: "2026-09-19" },
        recurrence: null,
        conference: null,
      }),
    })
  })

  it("converts the split boundary and the new rule", async () => {
    const calls = mockRpc({
      "TauRPC__caldir.split_recurring_series_at": rpcEvent({ id: "new-master" }),
    })
    const newMaster = await splitRecurringSeriesAt({
      calendar_slug: "work",
      master_uid: "master",
      split_start: zoned("2026-09-25T09:00:00"),
      split_end: zoned("2026-09-25T09:30:00"),
      new_recurrence: { rrule: "FREQ=DAILY", exdates: [], rdates: [] },
    })
    expect(calls[0].args).toEqual({
      input: {
        calendar_slug: "work",
        master_uid: "master",
        split_start: {
          kind: "datetime_zoned",
          wallclock: "2026-09-25T09:00:00",
          tzid: "Europe/Berlin",
        },
        split_end: {
          kind: "datetime_zoned",
          wallclock: "2026-09-25T09:30:00",
          tzid: "Europe/Berlin",
        },
        new_recurrence: { rrule: "FREQ=DAILY", exdates: [], rdates: [] },
      },
    })
    expect(newMaster.id).toBe("new-master")
  })

  it("passes structured backend failures through unchanged", async () => {
    const failure = { kind: "calendar_not_found", message: "[archive]: No such calendar" }
    mockIPC(() => Promise.reject(failure))
    const error: unknown = await getStoredEvent({ calendar_slug: "archive", id: "event" }).catch(
      (value: unknown) => value,
    )
    expect(error).toBe(failure)
    expect(isRenCalError(error) && error.kind).toBe("calendar_not_found")
  })
})
