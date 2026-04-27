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

const MASS_DELETE_THRESHOLD = 10

interface SyncContextType {
  sync: () => Promise<void>
  isSyncing: boolean
  syncError: string | null
  pendingMassDelete: SyncPreview[] | null
  confirmMassDelete: () => Promise<void>
  cancelMassDelete: () => void
}

const SyncContext = createContext({} as SyncContextType)

export function useSync() {
  return useContext(SyncContext)
}

export function SyncProvider({ children }: { children: ReactNode }) {
  const { calendars } = useCalendars()

  const [isSyncing, setIsSyncing] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [pendingMassDelete, setPendingMassDelete] = useState<SyncPreview[] | null>(null)
  const isSyncingRef = useRef(false)

  const sync = useCallback(async () => {
    const calendarSlugs = calendars.filter((c) => c.provider !== null).map((c) => c.slug)
    if (calendarSlugs.length === 0 || isSyncingRef.current) return

    isSyncingRef.current = true
    setIsSyncing(true)
    setSyncError(null)
    try {
      const previews = await rpc.caldir.sync_preview(calendarSlugs)
      const tripped = previews.filter((p) => p.to_push_delete_count >= MASS_DELETE_THRESHOLD)
      const safeSlugs = calendarSlugs.filter(
        (slug) => !tripped.some((t) => t.calendar_slug === slug),
      )

      if (safeSlugs.length > 0) {
        await rpc.caldir.sync(safeSlugs, [])
      }

      if (tripped.length > 0) {
        setPendingMassDelete(tripped)
        // Keep isSyncingRef true while the dialog is open so auto-syncs don't
        // pile up. confirmMassDelete / cancelMassDelete release it.
        setIsSyncing(false)
        return
      }
    } catch (e) {
      setSyncError(e instanceof Error ? e.message : String(e))
    }
    isSyncingRef.current = false
    setIsSyncing(false)
  }, [calendars])

  const confirmMassDelete = useCallback(async () => {
    const tripped = pendingMassDelete
    if (tripped === null) return

    setPendingMassDelete(null)
    setIsSyncing(true)
    setSyncError(null)
    try {
      const slugs = tripped.map((t) => t.calendar_slug)
      await rpc.caldir.sync(slugs, slugs)
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
    void sync()
  }, [sync])

  useEffect(() => {
    const unlisten = getCurrentWindow().onFocusChanged(({ payload: focused }) => {
      if (focused) {
        void sync()
      }
    })
    return () => {
      unlisten.then((fn) => fn())
    }
  }, [sync])

  const value = useMemo<SyncContextType>(
    () => ({
      sync,
      isSyncing,
      syncError,
      pendingMassDelete,
      confirmMassDelete,
      cancelMassDelete,
    }),
    [sync, isSyncing, syncError, pendingMassDelete, confirmMassDelete, cancelMassDelete],
  )

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>
}
