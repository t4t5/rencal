import { getCurrentWindow } from "@tauri-apps/api/window"
import {
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"

import { rpc } from "@/rpc"
import { SyncPreview } from "@/rpc/bindings"

import { useCalendars } from "@/contexts/CalendarStateContext"
import { useSettings } from "@/contexts/SettingsContext"

const MASS_DELETE_THRESHOLD = 10

interface SyncContextType {
  sync: () => Promise<void>
  syncNow: () => Promise<void>
  isChecking: boolean
  isSyncing: boolean
  syncError: string | null
  pendingPreviews: SyncPreview[]
  pendingMassDelete: SyncPreview[] | null
  confirmMassDelete: () => Promise<void>
  discardMassDelete: () => Promise<void>
  cancelMassDelete: () => void
}

const SyncContext = createContext({} as SyncContextType)

export function useSync() {
  return useContext(SyncContext)
}

export function SyncProvider({ children }: { children: ReactNode }) {
  const { calendars } = useCalendars()
  const { autoSyncEnabled } = useSettings()

  const [isChecking, setIsChecking] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [pendingPreviews, setPendingPreviews] = useState<SyncPreview[]>([])
  const [pendingMassDelete, setPendingMassDelete] = useState<SyncPreview[] | null>(null)
  const isSyncingRef = useRef(false)
  // Read in the stable `sync` callback so post-edit/post-create sync calls
  // honor the current toggle without changing `sync`'s identity.
  const autoSyncEnabledRef = useRef(autoSyncEnabled)
  useEffect(() => {
    autoSyncEnabledRef.current = autoSyncEnabled
  }, [autoSyncEnabled])

  const runSync = useCallback(
    async (apply: boolean) => {
      const calendarSlugs = calendars.filter((c) => c.provider !== null).map((c) => c.slug)
      if (calendarSlugs.length === 0 || isSyncingRef.current) return

      isSyncingRef.current = true
      setIsChecking(true)
      setSyncError(null)
      try {
        const previews = await rpc.caldir.sync_preview(calendarSlugs)
        const withWork = previews.filter((p) => p.to_push_count > 0 || p.to_pull_count > 0)
        setPendingPreviews(withWork)
        setIsChecking(false)

        if (!apply) {
          isSyncingRef.current = false
          return
        }

        const tripped = previews.filter((p) => p.to_push_delete_count >= MASS_DELETE_THRESHOLD)
        const safeSlugs = withWork
          .map((p) => p.calendar_slug)
          .filter((slug) => !tripped.some((t) => t.calendar_slug === slug))

        if (safeSlugs.length > 0) {
          setIsSyncing(true)
          await rpc.caldir.sync(safeSlugs, [])
          setIsSyncing(false)
        }

        if (tripped.length > 0) {
          setPendingMassDelete(tripped)
          // Keep isSyncingRef true while the dialog is open so auto-syncs don't
          // pile up. confirmMassDelete / cancelMassDelete release it.
          // Leave pendingPreviews as-is so the count still reflects what's outstanding.
          return
        }

        setPendingPreviews([])
      } catch (e) {
        setSyncError(e instanceof Error ? e.message : String(e))
      }
      isSyncingRef.current = false
      setIsChecking(false)
      setIsSyncing(false)
    },
    [calendars],
  )

  const sync = useCallback(() => runSync(autoSyncEnabledRef.current), [runSync])
  const syncNow = useCallback(() => runSync(true), [runSync])

  const confirmMassDelete = useCallback(async () => {
    const tripped = pendingMassDelete
    if (tripped === null) return

    setPendingMassDelete(null)
    setIsSyncing(true)
    setSyncError(null)
    try {
      const slugs = tripped.map((t) => t.calendar_slug)
      await rpc.caldir.sync(slugs, slugs)
      setPendingPreviews((prev) => prev.filter((p) => !slugs.includes(p.calendar_slug)))
    } catch (e) {
      setSyncError(e instanceof Error ? e.message : String(e))
    } finally {
      isSyncingRef.current = false
      setIsSyncing(false)
    }
  }, [pendingMassDelete])

  const discardMassDelete = useCallback(async () => {
    const tripped = pendingMassDelete
    if (tripped === null) return

    setPendingMassDelete(null)
    setIsSyncing(true)
    setSyncError(null)
    try {
      const slugs = tripped.map((t) => t.calendar_slug)
      await rpc.caldir.discard(slugs)
      setPendingPreviews((prev) => prev.filter((p) => !slugs.includes(p.calendar_slug)))
    } catch (e) {
      setSyncError(e instanceof Error ? e.message : String(e))
    } finally {
      isSyncingRef.current = false
      setIsSyncing(false)
    }
  }, [pendingMassDelete])

  const cancelMassDelete = useCallback(() => {
    setPendingMassDelete(null)
    isSyncingRef.current = false
  }, [])

  useEffect(() => {
    void runSync(autoSyncEnabled)
  }, [runSync, autoSyncEnabled])

  useEffect(() => {
    const unlisten = getCurrentWindow().onFocusChanged(({ payload: focused }) => {
      if (focused) {
        void runSync(autoSyncEnabled)
      }
    })
    return () => {
      unlisten.then((fn) => fn())
    }
  }, [runSync, autoSyncEnabled])

  const value = useMemo<SyncContextType>(
    () => ({
      sync,
      syncNow,
      isChecking,
      isSyncing,
      syncError,
      pendingPreviews,
      pendingMassDelete,
      confirmMassDelete,
      discardMassDelete,
      cancelMassDelete,
    }),
    [
      sync,
      syncNow,
      isChecking,
      isSyncing,
      syncError,
      pendingPreviews,
      pendingMassDelete,
      confirmMassDelete,
      discardMassDelete,
      cancelMassDelete,
    ],
  )

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>
}
