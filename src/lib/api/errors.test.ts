// @vitest-environment happy-dom
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks"
import { toast } from "sonner"
import { afterEach, describe, expect, it, vi } from "vitest"

import { rpc } from "@/rpc"

import { rpcToCalendarEvent } from "@/lib/cal-events"
import { updateAndSyncEvent } from "@/lib/save-event"

import { getErrorMessage, isRpcError } from "./errors"

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }))

afterEach(() => {
  clearMocks()
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

describe("RPC errors", () => {
  it("guards unknown values and retains access to the category", () => {
    const failure: unknown = { kind: "configuration", message: "Invalid config" }
    expect(isRpcError(failure)).toBe(true)
    if (!isRpcError(failure)) throw new Error("Expected an RPC error")
    expect(failure.kind).toBe("configuration")
    for (const value of [
      null,
      42,
      {},
      { message: "Oops" },
      { kind: "io", message: 42 },
      { kind: "unrecognized", message: "Oops" },
      { kind: "toString", message: "Oops" },
    ]) {
      expect(isRpcError(value)).toBe(false)
    }
  })

  it("preserves the rejected object through the real generated proxy", async () => {
    const failure = { kind: "provider_failure", message: "[work]: Provider timed out" }
    const invoke = vi.fn().mockRejectedValue(failure)
    mockIPC(invoke)
    const error: unknown = await rpc.caldir.sync([]).catch((value: unknown) => value)
    expect(invoke).toHaveBeenCalledWith("TauRPC__caldir.sync", { allow_mass_delete: [] })
    expect(error).toBe(failure)
    expect(getErrorMessage(error, "Sync failed")).toBe(failure.message)
  })

  it.each([
    [{ kind: "event_not_found", message: "Event no longer exists" }, "Event no longer exists"],
    ["Calendar is read-only", "Calendar is read-only"],
    [new Error("Connection failed"), "Connection failed"],
    [{ unexpected: true }, "Failed to save event"],
    [null, "Failed to save event"],
    ["  ", "Failed to save event"],
  ])("renders a readable save failure and rolls back for %j", async (failure, message) => {
    mockIPC(() => Promise.reject(failure))
    vi.spyOn(console, "error").mockImplementation(() => {})
    const original = rpcToCalendarEvent({
      id: "event",
      calendar_slug: "work",
      summary: "Before",
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
    const current = { ...original, summary: "After" }
    let events = [original]
    const requestSync = vi.fn()
    await updateAndSyncEvent(
      current,
      original,
      (update) => {
        events = typeof update === "function" ? update(events) : update
      },
      requestSync,
    )
    expect(events).toEqual([original])
    expect(requestSync).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledExactlyOnceWith("Failed to save event", {
      description: message,
    })
  })
})
