// @vitest-environment happy-dom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { api, type SyncFailure, type SyncPreview } from "@/lib/api"

import { SyncProvider, useSync } from "./SyncContext"

const settings = vi.hoisted(() => ({ autoSyncEnabled: true }))
const reloadEvents = vi.hoisted(() => vi.fn())
// Stable, like the real context: a new array would re-run the sync effect.
const calendars = vi.hoisted(() => [
  { slug: "work", provider: "ok" },
  { slug: "fastmail", provider: "broken" },
])

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({ onFocusChanged: () => Promise.resolve(() => {}) }),
}))
vi.mock("@/contexts/CalendarStateContext", () => ({
  useCalendars: () => ({ calendars }),
}))
vi.mock("@/contexts/CalEventsContext", () => ({
  useCalEvents: () => ({ reloadEvents }),
}))
vi.mock("@/contexts/SettingsContext", () => ({
  useSettings: () => ({ autoSyncEnabled: settings.autoSyncEnabled, settingsLoaded: true }),
}))
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  api: {
    sync: { preview: vi.fn(), run: vi.fn(), discardPendingChanges: vi.fn() },
  },
}))

const preview = vi.mocked(api.sync.preview)
const run = vi.mocked(api.sync.run)

const workPreview: SyncPreview = {
  calendar_slug: "work",
  to_push_count: 0,
  to_push_delete_count: 0,
  to_pull_count: 1,
}
const fastmailFailure: SyncFailure = {
  calendar_slug: "fastmail",
  error: { kind: "provider_failure", message: "malformed resource" },
}

let root: Root
let context: ReturnType<typeof useSync>

function Consumer() {
  context = useSync()
  return null
}

async function render() {
  await act(async () => {
    root.render(
      <SyncProvider>
        <Consumer />
      </SyncProvider>,
    )
  })
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  settings.autoSyncEnabled = true
  preview.mockReset()
  run.mockReset()
  reloadEvents.mockReset()
  root = createRoot(document.createElement("div"))
})

afterEach(async () => {
  await act(async () => root.unmount())
  vi.unstubAllGlobals()
})

describe("a calendar failing to sync", () => {
  it("does not stop the others from syncing", async () => {
    preview.mockResolvedValue({ previews: [workPreview], failures: [fastmailFailure] })
    run.mockResolvedValue([fastmailFailure])

    await render()

    expect(run).toHaveBeenCalledExactlyOnceWith([])
    expect(reloadEvents).toHaveBeenCalledOnce()
    expect(context.syncFailures).toEqual([fastmailFailure])
    expect(context.syncError).toBeNull()
  })

  it("reports the run's failures over the preview's", async () => {
    preview.mockResolvedValue({ previews: [workPreview], failures: [fastmailFailure] })
    run.mockResolvedValue([])

    await render()

    expect(context.syncFailures).toEqual([])
  })

  it("reports the preview's failures when nothing is applied", async () => {
    settings.autoSyncEnabled = false
    preview.mockResolvedValue({ previews: [workPreview], failures: [fastmailFailure] })

    await render()

    expect(run).not.toHaveBeenCalled()
    expect(context.syncFailures).toEqual([fastmailFailure])
    expect(context.pendingPreviews).toEqual([workPreview])
  })
})
