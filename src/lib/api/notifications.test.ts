import { emit, listen, type UnlistenFn } from "@tauri-apps/api/event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { emitAppEvent, listenNotification } from "./notifications"

vi.mock("@tauri-apps/api/event", () => ({ emit: vi.fn(), listen: vi.fn() }))

beforeEach(() => vi.resetAllMocks())

describe("app notification adapter", () => {
  it("dispatches the native payload and unregisters once", async () => {
    const stop = vi.fn()
    vi.mocked(listen).mockResolvedValue(stop)
    const handler = vi.fn()
    const subscription = listenNotification("caldir-config-changed", handler)
    await subscription.ready

    const [name, dispatch] = vi.mocked(listen).mock.calls[0]
    const settings = {
      time_format: "24h",
      default_reminders: [5],
      default_calendar: "work",
      calendar_dir: "~/caldir",
    }
    expect(name).toBe("caldir-config-changed")
    dispatch({ event: name, id: 1, payload: settings })
    expect(handler).toHaveBeenCalledExactlyOnceWith(settings)

    subscription.unlisten()
    subscription.unlisten()
    dispatch({ event: name, id: 1, payload: settings })
    expect(stop).toHaveBeenCalledOnce()
    expect(handler).toHaveBeenCalledOnce()
  })

  it("cleans up a registration that completes after unmount", async () => {
    const registration = Promise.withResolvers<UnlistenFn>()
    vi.mocked(listen).mockReturnValue(registration.promise)
    const stop = vi.fn()
    const handler = vi.fn()
    const subscription = listenNotification("events-changed", handler)
    subscription.unlisten()
    const [name, dispatch] = vi.mocked(listen).mock.calls[0]
    dispatch({ event: name, id: 1, payload: null })
    registration.resolve(stop)
    await subscription.ready
    subscription.unlisten()
    expect(stop).toHaveBeenCalledOnce()
    expect(handler).not.toHaveBeenCalled()
  })

  it("exposes registration failures to callers waiting for readiness", async () => {
    vi.mocked(listen).mockRejectedValue("registration failed")
    const subscription = listenNotification("events-changed", () => {})
    await expect(subscription.ready).rejects.toBe("registration failed")
    subscription.unlisten()
  })

  it("broadcasts the theme payload and canonical null for omitted unit payloads", async () => {
    await emitAppEvent("theme-changed", "user:custom")
    await emitAppEvent("rencal-config-changed")
    await emitAppEvent("rencal-config-changed", null)
    expect(emit).toHaveBeenNthCalledWith(1, "theme-changed", "user:custom")
    expect(emit).toHaveBeenNthCalledWith(2, "rencal-config-changed", null)
    expect(emit).toHaveBeenNthCalledWith(3, "rencal-config-changed", null)
  })
})
