import { getCurrentWindow } from "@tauri-apps/api/window"
import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react"

import { rpc } from "@/rpc"
import { SyncPreview } from "@/rpc/bindings"

import { useCalEvents } from "@/contexts/CalEventsContext"
import { useCalendars } from "@/contexts/CalendarStateContext"
import { useSettings } from "@/contexts/SettingsContext"

import { createStrictContext } from "@/lib/strict-context"

const MASS_DELETE_THRESHOLD = 10

type SyncStatus = "idle" | "checking" | "syncing"

interface SyncContextType {
  requestSync: () => Promise<void>
  syncNow: () => Promise<void>
  syncStatus: SyncStatus
  syncError: string | null
  pendingPreviews: SyncPreview[]
  pendingMassDelete: SyncPreview[] | null
  confirmMassDelete: () => Promise<void>
  discardMassDelete: () => Promise<void>
  cancelMassDelete: () => void
}

const [SyncContextProvider, useSync] = createStrictContext<SyncContextType>("Sync")

export { useSync }

export function SyncProvider({ children }: { children: ReactNode }) {
  const { calendars } = useCalendars()
  const { reloadEvents } = useCalEvents()
  const { autoSyncEnabled, settingsLoaded } = useSettings()

  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle")
  const [syncError, setSyncError] = useState<string | null>(null)
  const [pendingPreviews, setPendingPreviews] = useState<SyncPreview[]>([])
  const [pendingMassDelete, setPendingMassDelete] = useState<SyncPreview[] | null>(null)
  // Re-entrancy lock, not a mirror of `syncStatus`: it can outlive a run
  // (held while the mass-delete dialog is open) to keep syncs from piling up.
  const syncLockRef = useRef(false)
  // Read in the stable `requestSync` callback so post-edit/post-create calls
  // honor the current toggle without changing `requestSync`'s identity.
  const autoSyncEnabledRef = useRef(autoSyncEnabled)
  useEffect(() => {
    autoSyncEnabledRef.current = autoSyncEnabled
  }, [autoSyncEnabled])

  const runSync = useCallback(
    async ({ apply, manual = false }: { apply: boolean; manual?: boolean }) => {
      const calendarSlugs = calendars.filter((c) => c.provider !== null).map((c) => c.slug)
      if (calendarSlugs.length === 0 || syncLockRef.current) return

      syncLockRef.current = true
      // A manual sync reports the whole run — preview included — as "syncing",
      // so the UI never shows just "checking" when the preview turns out empty.
      setSyncStatus(manual ? "syncing" : "checking")
      setSyncError(null)
      try {
        const previews = await rpc.caldir.sync_preview()
        const withWork = previews.filter((p) => p.to_push_count > 0 || p.to_pull_count > 0)
        setPendingPreviews(withWork)

        if (!apply) {
          syncLockRef.current = false
          setSyncStatus("idle")
          return
        }

        const tripped = previews.filter((p) => p.to_push_delete_count >= MASS_DELETE_THRESHOLD)

        if (withWork.length > 0) {
          setSyncStatus("syncing")
          await rpc.caldir.sync([])
          await reloadEvents()
        }

        if (tripped.length > 0) {
          setPendingMassDelete(tripped)
          setSyncStatus("idle")
          // Keep the lock held while the dialog is open so auto-syncs don't
          // pile up. confirmMassDelete / cancelMassDelete release it.
          // Leave pendingPreviews as-is so the count still reflects what's outstanding.
          return
        }

        setPendingPreviews([])
      } catch (e) {
        setSyncError(e instanceof Error ? e.message : String(e))
      }
      syncLockRef.current = false
      setSyncStatus("idle")
    },
    [calendars, reloadEvents],
  )

  const requestSync = useCallback(() => runSync({ apply: autoSyncEnabledRef.current }), [runSync])

  // Manual "sync now" (toolbar button, `s` shortcut).
  const syncNow = useCallback(() => runSync({ apply: true, manual: true }), [runSync])

  const confirmMassDelete = useCallback(async () => {
    const tripped = pendingMassDelete
    if (tripped === null) return

    setPendingMassDelete(null)
    setSyncStatus("syncing")
    setSyncError(null)
    try {
      const slugs = tripped.map((t) => t.calendar_slug)
      await rpc.caldir.sync(slugs)
      setPendingPreviews((prev) => prev.filter((p) => !slugs.includes(p.calendar_slug)))
    } catch (e) {
      setSyncError(e instanceof Error ? e.message : String(e))
    } finally {
      syncLockRef.current = false
      setSyncStatus("idle")
    }
  }, [pendingMassDelete])

  const discardMassDelete = useCallback(async () => {
    const tripped = pendingMassDelete
    if (tripped === null) return

    setPendingMassDelete(null)
    setSyncStatus("syncing")
    setSyncError(null)
    try {
      const slugs = tripped.map((t) => t.calendar_slug)
      await rpc.caldir.discard()
      setPendingPreviews((prev) => prev.filter((p) => !slugs.includes(p.calendar_slug)))
    } catch (e) {
      setSyncError(e instanceof Error ? e.message : String(e))
    } finally {
      syncLockRef.current = false
      setSyncStatus("idle")
    }
  }, [pendingMassDelete])

  const cancelMassDelete = useCallback(() => {
    setPendingMassDelete(null)
    syncLockRef.current = false
  }, [])

  useEffect(() => {
    if (!settingsLoaded) return
    void runSync({ apply: autoSyncEnabled })
  }, [runSync, autoSyncEnabled, settingsLoaded])

  useEffect(() => {
    const unlisten = getCurrentWindow().onFocusChanged(({ payload: focused }) => {
      if (focused && settingsLoaded) {
        void runSync({ apply: autoSyncEnabled })
      }
    })
    return () => {
      unlisten.then((fn) => fn())
    }
  }, [runSync, autoSyncEnabled, settingsLoaded])

  const value = useMemo<SyncContextType>(
    () => ({
      requestSync,
      syncNow,
      syncStatus,
      syncError,
      pendingPreviews,
      pendingMassDelete,
      confirmMassDelete,
      discardMassDelete,
      cancelMassDelete,
    }),
    [
      requestSync,
      syncNow,
      syncStatus,
      syncError,
      pendingPreviews,
      pendingMassDelete,
      confirmMassDelete,
      discardMassDelete,
      cancelMassDelete,
    ],
  )

  return <SyncContextProvider value={value}>{children}</SyncContextProvider>
}
