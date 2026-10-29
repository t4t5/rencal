// @vitest-environment happy-dom
import { Temporal } from "@js-temporal/polyfill"
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks"
import { afterEach, expect, it } from "vitest"

import { api } from "@/lib/api"

afterEach(clearMocks)

const at = (iso: string) => Temporal.Instant.from(iso)

it("sends picked ranges as UTC strings and returns preview spans as instants", async () => {
  mockIPC((cmd, args) => {
    if (cmd !== "TauRPC__caldir.preview_availability") throw new Error(`Unexpected ${cmd}`)
    expect(args).toEqual({
      source: {
        kind: "ranges",
        ranges: [{ start: "2026-11-02T09:00:00Z", end: "2026-11-02T10:00:00Z" }],
        tzid: "Europe/Stockholm",
      },
      calendar_slugs: ["personal"],
      from: "2026-11-01T23:00:00Z",
      to: "2026-11-08T23:00:00Z",
    })
    return {
      available: [{ start: "2026-11-02T09:00:00Z", end: "2026-11-02T10:00:00Z" }],
      busy: [],
      free: [{ start: "2026-11-02T09:00:00Z", end: "2026-11-02T10:00:00Z" }],
    }
  })

  const preview = await api.availability.preview(
    {
      kind: "ranges",
      ranges: [{ start: at("2026-11-02T10:00:00+01:00"), end: at("2026-11-02T10:00:00Z") }],
      tzid: "Europe/Stockholm",
    },
    ["personal"],
    at("2026-11-01T23:00:00Z"),
    at("2026-11-08T23:00:00Z"),
  )

  expect(preview.free[0].start.equals(at("2026-11-02T09:00:00Z"))).toBe(true)
  expect(preview.busy).toEqual([])
})

it("passes saved and draft sources through unchanged", async () => {
  const draft = {
    name: "Calls",
    tzid: "Europe/Stockholm",
    hours: [],
    duration_minutes: 30,
    buffer_before_minutes: 0,
    buffer_after_minutes: 0,
    notice_minutes: 0,
    horizon_days: 14,
  }
  mockIPC((cmd, args) => {
    if (cmd !== "TauRPC__caldir.free_times_text") throw new Error(`Unexpected ${cmd}`)
    expect(args).toEqual({
      source: { kind: "draft", id: "availability/calls", draft },
      calendar_slugs: [],
      tzid: null,
    })
    return "Calls:\nNo free times (Europe/Stockholm)"
  })

  await expect(
    api.availability.freeTimesText({ kind: "draft", id: "availability/calls", draft }, [], null),
  ).resolves.toBe("Calls:\nNo free times (Europe/Stockholm)")
})
