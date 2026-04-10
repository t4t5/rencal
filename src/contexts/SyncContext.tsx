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

import { useCalEvents } from "@/contexts/CalEventsContext"
import { useCalendars } from "@/contexts/CalendarStateContext"

interface SyncContextType {
  sync: () => Promise<void>
  isSyncing: boolean
  syncError: string | null
}

const SyncContext = createContext({} as SyncContextType)

export function useSync() {
  return useContext(SyncContext)
}

export function SyncProvider({ children }: { children: ReactNode }) {
  const { calendars } = useCalendars()
  const { reloadEvents } = useCalEvents()

  const [isSyncing, setIsSyncing] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)
  const isSyncingRef = useRef(false)

  const sync = useCallback(async () => {
    const calendarSlugs = calendars.filter((c) => c.provider !== null).map((c) => c.slug)
    if (calendarSlugs.length === 0 || isSyncingRef.current) return

    isSyncingRef.current = true
    setIsSyncing(true)
    setSyncError(null)
    try {
      await rpc.caldir.sync(calendarSlugs)
      await reloadEvents()
    } catch (e) {
      setSyncError(e instanceof Error ? e.message : String(e))
    } finally {
      isSyncingRef.current = false
      setIsSyncing(false)
    }
  }, [calendars, reloadEvents])

  // Sync on mount and when calendars change
  useEffect(() => {
    void sync()
  }, [sync])

  // Sync when the window regains focus
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
    () => ({ sync, isSyncing, syncError }),
    [sync, isSyncing, syncError],
  )

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>
}
