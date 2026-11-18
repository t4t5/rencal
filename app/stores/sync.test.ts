import { api, type Calendar, type SyncFailure, type SyncPreview } from "@/lib/api"
import { afterEach, beforeEach, describe, expect, it } from "@/lib/testing/vitest"

import { reloadCalendars } from "@/stores/calendar"
import {
  cancelMassDelete,
  confirmMassDelete,
  discardMassDelete,
  pendingMassDelete,
  pendingPreviews,
  requestSync,
  syncError,
  syncFailures,
  syncNow,
  syncStatus,
} from "@/stores/sync"

const preview = (calendar_slug: string, counts: Partial<SyncPreview> = {}): SyncPreview =>
  ({
    calendar_slug,
    to_push_count: 0,
    to_pull_count: 0,
    to_push_delete_count: 0,
    ...counts,
  }) as SyncPreview

type PreviewResult = { previews: SyncPreview[]; failures: SyncFailure[] }
type Stubbed = {
  preview: () => Promise<PreviewResult>
  run: (slugs: string[]) => Promise<SyncFailure[]>
}
const sync = api.sync as unknown as Stubbed & {
  discardPendingChanges: () => Promise<SyncFailure[]>
}

const fastmailFailure: SyncFailure = {
  calendar_slug: "fastmail",
  error: { kind: "provider_failure", message: "malformed resource" },
}
const calendarsApi = api.calendars as unknown as { list: () => Promise<Calendar[]> }

const setCalendars = (list: Partial<Calendar>[]) => {
  calendarsApi.list = () => Promise.resolve(list as Calendar[])
  return reloadCalendars()
}

describe("sync", () => {
  let ran: string[][] = []
  let discarded = 0
  let previews: SyncPreview[] = []
  let previewFailures: SyncFailure[] = []
  let runFailures: SyncFailure[] = []
  const real = { ...api.sync }
  const realCalendars = { ...api.calendars }

  beforeEach(async () => {
    ran = []
    discarded = 0
    previews = []
    previewFailures = []
    runFailures = []
    await setCalendars([{ slug: "work", provider: "google" }])
    sync.preview = () => Promise.resolve({ previews, failures: previewFailures })
    sync.run = (slugs) => {
      ran.push(slugs)
      return Promise.resolve(runFailures)
    }
    sync.discardPendingChanges = () => {
      discarded += 1
      return Promise.resolve([])
    }
  })

  afterEach(() => {
    Object.assign(sync, real)
    Object.assign(calendarsApi, realCalendars)
    cancelMassDelete()
  })

  it("does nothing without a provider calendar", async () => {
    await setCalendars([{ slug: "local", provider: null }])
    previews = [preview("local", { to_pull_count: 1 })]
    await syncNow()
    expect(ran).toEqual([])
    expect(pendingPreviews()).toEqual([])
  })

  it("applies what a manual sync finds, and clears it", async () => {
    previews = [preview("work", { to_pull_count: 2 })]
    await syncNow()
    expect(ran).toEqual([[]])
    expect(pendingPreviews()).toEqual([])
    expect(syncStatus()).toBe("idle")
  })

  it("holds a large deletion for confirmation, and syncs nothing else meanwhile", async () => {
    previews = [preview("work", { to_push_count: 12, to_push_delete_count: 12 })]
    await syncNow()
    expect(pendingMassDelete()?.map((p) => p.calendar_slug)).toEqual(["work"])
    expect(pendingPreviews()).toHaveLength(1)

    ran = []
    await syncNow()
    expect(ran).toEqual([])

    await confirmMassDelete()
    expect(ran).toEqual([["work"]])
    expect(pendingMassDelete()).toBeNull()
    expect(pendingPreviews()).toEqual([])
  })

  it("can restore the events instead, or leave them for later", async () => {
    previews = [preview("work", { to_push_count: 12, to_push_delete_count: 12 })]
    await syncNow()
    await discardMassDelete()
    expect(discarded).toBe(1)

    await syncNow()
    cancelMassDelete()
    expect(pendingMassDelete()).toBeNull()
    await syncNow()
    expect(pendingMassDelete()).not.toBeNull()
  })

  it("reports a failure and recovers", async () => {
    sync.preview = () => Promise.reject(new Error("offline"))
    await syncNow()
    expect(syncError()).toBe("offline")
    expect(syncStatus()).toBe("idle")
    sync.preview = () => Promise.resolve({ previews: [], failures: [] })
    await syncNow()
    expect(syncError()).toBeNull()
  })

  it("only previews while auto-sync is off", async () => {
    previews = [preview("work", { to_pull_count: 1 })]
    await requestSync()
    expect(syncStatus()).toBe("idle")
  })

  describe("a calendar failing to sync", () => {
    it("does not stop the others from syncing", async () => {
      previews = [preview("work", { to_pull_count: 1 })]
      previewFailures = [fastmailFailure]
      runFailures = [fastmailFailure]
      await syncNow()
      expect(ran).toEqual([[]])
      expect(syncFailures()).toEqual([fastmailFailure])
      expect(syncError()).toBeNull()
    })

    it("reports the run's failures over the preview's", async () => {
      previews = [preview("work", { to_pull_count: 1 })]
      previewFailures = [fastmailFailure]
      await syncNow()
      expect(syncFailures()).toEqual([])
    })

    it("reports the preview's failures when there is nothing to apply", async () => {
      previewFailures = [fastmailFailure]
      await syncNow()
      expect(ran).toEqual([])
      expect(syncFailures()).toEqual([fastmailFailure])
    })
  })
})
