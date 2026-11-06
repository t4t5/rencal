import { api, type Calendar, type SyncPreview } from "@/lib/api"
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

type Stubbed = { preview: () => Promise<SyncPreview[]>; run: (slugs: string[]) => Promise<void> }
const sync = api.sync as unknown as Stubbed & { discardPendingChanges: () => Promise<void> }
const calendarsApi = api.calendars as unknown as { list: () => Promise<Calendar[]> }

const setCalendars = (list: Partial<Calendar>[]) => {
  calendarsApi.list = () => Promise.resolve(list as Calendar[])
  return reloadCalendars()
}

describe("sync", () => {
  let ran: string[][] = []
  let discarded = 0
  let previews: SyncPreview[] = []
  const real = { ...api.sync }
  const realCalendars = { ...api.calendars }

  beforeEach(async () => {
    ran = []
    discarded = 0
    previews = []
    await setCalendars([{ slug: "work", provider: "google" }])
    sync.preview = () => Promise.resolve(previews)
    sync.run = (slugs) => {
      ran.push(slugs)
      return Promise.resolve()
    }
    sync.discardPendingChanges = () => {
      discarded += 1
      return Promise.resolve()
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
    sync.preview = () => Promise.resolve([])
    await syncNow()
    expect(syncError()).toBeNull()
  })

  it("only previews while auto-sync is off", async () => {
    previews = [preview("work", { to_pull_count: 1 })]
    await requestSync()
    expect(syncStatus()).toBe("idle")
  })
})
