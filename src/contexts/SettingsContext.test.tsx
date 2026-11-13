// @vitest-environment happy-dom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import { SettingsProvider, useSettings } from "./SettingsContext"

const mocks = vi.hoisted(() => ({
  getVisibleHours: vi.fn(),
  setVisibleHours: vi.fn(),
  emitAppEvent: vi.fn(),
  changed: () => {},
}))

vi.mock("@/lib/api", () => ({
  api: {
    settings: {
      getCaldirSettings: async () => ({
        time_format: "24h",
        default_reminders: [],
        default_calendar: null,
        calendar_dir: "/caldir",
      }),
      getNotificationsEnabled: async () => true,
      getAutoSyncEnabled: async () => true,
      getFirstDayOfWeek: async () => "monday",
      getShowWeekNumbers: async () => false,
      getCalendarGroups: async () => ({}),
      getVisibleHours: mocks.getVisibleHours,
      setVisibleHours: mocks.setVisibleHours,
    },
    notifications: {
      listen: (event: string, callback: () => void) => {
        if (event === "rencal-config-changed") mocks.changed = callback
        return { unlisten: vi.fn() }
      },
    },
  },
}))
vi.mock("@/lib/api/internal", () => ({ emitAppEvent: mocks.emitAppEvent }))

let root: Root
let settings: ReturnType<typeof useSettings>

function Consumer() {
  settings = useSettings()
  return null
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  vi.clearAllMocks()
  mocks.getVisibleHours.mockResolvedValue({ start_hour: 8, end_hour: 20 })
  mocks.setVisibleHours.mockResolvedValue(undefined)
  mocks.emitAppEvent.mockResolvedValue(undefined)
  const container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  document.body.replaceChildren()
  vi.unstubAllGlobals()
})

async function render() {
  await act(async () =>
    root.render(
      <SettingsProvider>
        <Consumer />
      </SettingsProvider>,
    ),
  )
}

it("loads persisted visible hours and reloads changes from another window", async () => {
  await render()
  expect(settings.settingsLoaded).toBe(true)
  expect(settings.visibleHours).toEqual({ start_hour: 8, end_hour: 20 })
  mocks.getVisibleHours.mockResolvedValue({ start_hour: 6, end_hour: 18 })
  await act(async () => mocks.changed())
  expect(settings.visibleHours).toEqual({ start_hour: 6, end_hour: 18 })
})

it("saves and broadcasts the complete range and supports disabling it", async () => {
  await render()
  await act(async () => settings.setVisibleHours({ start_hour: 0, end_hour: 24 }))
  expect(mocks.setVisibleHours).toHaveBeenLastCalledWith({ start_hour: 0, end_hour: 24 })
  expect(settings.visibleHours).toEqual({ start_hour: 0, end_hour: 24 })
  expect(mocks.emitAppEvent).toHaveBeenCalledWith("rencal-config-changed")
  await act(async () => settings.setVisibleHours(null))
  expect(mocks.setVisibleHours).toHaveBeenLastCalledWith(null)
  expect(settings.visibleHours).toBeNull()
})

it("keeps the saved range and does not broadcast when persistence fails", async () => {
  await render()
  mocks.setVisibleHours.mockRejectedValue(new Error("permission denied"))
  await act(async () => {
    await expect(settings.setVisibleHours({ start_hour: 7, end_hour: 19 })).rejects.toThrow(
      "permission denied",
    )
  })
  expect(settings.visibleHours).toEqual({ start_hour: 8, end_hour: 20 })
  expect(mocks.emitAppEvent).not.toHaveBeenCalled()
})
