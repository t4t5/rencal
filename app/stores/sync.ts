/*
 * Sync with the providers. A check previews what's outstanding; with auto-sync
 * it's applied too, unless a calendar would lose too many events at once, which
 * waits for the user. Runs on launch, on focus, and when calendars change.
 */
import { effect, lifecycle, signal, untracked } from "nsh"
import { Backend } from "rencal/native"

import { api, getErrorMessage, type SyncPreview } from "@/lib/api"

import { calendars } from "@/stores/calendar"
import { reloadEvents } from "@/stores/events"
import { autoSyncEnabled } from "@/stores/settings"

const MASS_DELETE_THRESHOLD = 10
const ONLINE_CHECK_MS = 10_000

export type SyncState = "idle" | "checking" | "syncing"

const status = signal<SyncState>("idle")
const error = signal<string | null>(null)
const previews = signal<SyncPreview[]>([])
const massDelete = signal<SyncPreview[] | null>(null)
const online = signal(true)

// Not a mirror of `status`: held while the mass-delete dialog is open, so syncs
// don't pile up behind it.
let locked = false

export const syncStatus = () => status()
export const syncError = () => error()
export const pendingPreviews = () => previews()
export const pendingMassDelete = () => massDelete()
export const isOnline = () => online()

async function runSync({ apply, manual = false }: { apply: boolean; manual?: boolean }) {
  const hasProvider = untracked(calendars).some((calendar) => calendar.provider !== null)
  if (!hasProvider || locked) return

  locked = true
  // A manual sync reports the whole run as syncing, so the button never shows
  // just "checking" when the preview turns out empty.
  status.set(manual ? "syncing" : "checking")
  error.set(null)
  try {
    const all = await api.sync.preview()
    const withWork = all.filter((p) => p.to_push_count > 0 || p.to_pull_count > 0)
    previews.set(withWork)

    if (!apply) {
      locked = false
      status.set("idle")
      return
    }

    const tripped = all.filter((p) => p.to_push_delete_count >= MASS_DELETE_THRESHOLD)

    if (withWork.length > 0) {
      status.set("syncing")
      await api.sync.run([])
      await reloadEvents()
    }

    if (tripped.length > 0) {
      massDelete.set(tripped)
      status.set("idle")
      // The previews stay, so the count still reflects what's outstanding.
      return
    }

    previews.set([])
  } catch (e) {
    error.set(getErrorMessage(e, "Failed to sync calendars"))
  }
  locked = false
  status.set("idle")
}

/** After an edit: a check, or a sync when auto-sync is on. */
export const requestSync = () => runSync({ apply: untracked(autoSyncEnabled) })

/** Manual "sync now" (toolbar button, `s` shortcut). */
export const syncNow = () => runSync({ apply: true, manual: true })

async function settleMassDelete(settle: (slugs: string[]) => Promise<void>) {
  const tripped = massDelete()
  if (tripped === null) return

  massDelete.set(null)
  status.set("syncing")
  error.set(null)
  try {
    const slugs = tripped.map((preview) => preview.calendar_slug)
    await settle(slugs)
    previews.update((list) => list.filter((p) => !slugs.includes(p.calendar_slug)))
  } catch (e) {
    error.set(getErrorMessage(e, "Failed to sync calendars"))
  } finally {
    locked = false
    status.set("idle")
  }
}

export const confirmMassDelete = () => settleMassDelete((slugs) => api.sync.run(slugs))

export const discardMassDelete = () => settleMassDelete(() => api.sync.discardPendingChanges())

export function cancelMassDelete() {
  massDelete.set(null)
  locked = false
}

const checkOnline = async () => online.set(await Backend.isOnline())

export function startSync() {
  // On launch, and whenever calendars change or the window gets the focus back.
  let wasActive = false
  effect(() => {
    calendars()
    const apply = autoSyncEnabled()
    const active = lifecycle() === "active"
    const lostFocus = wasActive && !active
    wasActive = active
    if (!lostFocus) void untracked(() => runSync({ apply }))
  })
  void checkOnline()
  setInterval(() => void checkOnline(), ONLINE_CHECK_MS)
}
