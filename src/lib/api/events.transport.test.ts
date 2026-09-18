// @vitest-environment happy-dom
import { emit } from "@tauri-apps/api/event"
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks"
import { afterEach, expect, it, vi } from "vitest"

import { emitAppEvent, listenAppEvent } from "./events"

afterEach(clearMocks)

it("propagates frontend broadcasts and backend payloads through the native event API", async () => {
  mockIPC(() => {}, { shouldMockEvents: true })
  const appTheme = vi.fn()
  const settingsTheme = vi.fn()
  const configChanged = vi.fn()
  const applySettings = vi.fn()
  const subscriptions = [
    listenAppEvent("theme-changed", appTheme),
    listenAppEvent("theme-changed", settingsTheme),
    listenAppEvent("rencal-config-changed", configChanged),
    listenAppEvent("caldir-config-changed", applySettings),
  ]
  await Promise.all(subscriptions.map((subscription) => subscription.ready))

  await emitAppEvent("theme-changed", "user:night")
  await emitAppEvent("rencal-config-changed")
  const settings = {
    time_format: "12h",
    default_reminders: [15],
    default_calendar: "work",
    calendar_dir: "~/caldir",
  }
  // Simulate the native producer; application frontend code cannot emit this name.
  await emit("caldir-config-changed", settings)
  expect(appTheme).toHaveBeenCalledExactlyOnceWith("user:night")
  expect(settingsTheme).toHaveBeenCalledExactlyOnceWith("user:night")
  expect(configChanged).toHaveBeenCalledExactlyOnceWith(null)
  expect(applySettings).toHaveBeenCalledExactlyOnceWith(settings)

  subscriptions.forEach((subscription) => subscription.unlisten())
  await emitAppEvent("theme-changed", "ren")
  expect(appTheme).toHaveBeenCalledOnce()
  expect(settingsTheme).toHaveBeenCalledOnce()
})
