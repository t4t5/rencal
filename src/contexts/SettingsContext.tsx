import { emit, listen } from "@tauri-apps/api/event"
import { ReactNode, createContext, useContext, useEffect, useState } from "react"

import { rpc } from "@/rpc"
import type { TimeFormat } from "@/rpc/bindings"
import {
  AUTO_SYNC_ENABLED_CHANGED,
  CALENDAR_DIR_CHANGED,
  DEFAULT_CALENDAR_CHANGED,
  DEFAULT_REMINDERS_CHANGED,
  NOTIFICATIONS_ENABLED_CHANGED,
  TIME_FORMAT_CHANGED,
} from "@/rpc/events"

interface SettingsContextType {
  timeFormat: TimeFormat
  setTimeFormat: (tf: TimeFormat) => Promise<void>
  defaultReminders: number[]
  setDefaultReminders: (mins: number[]) => Promise<void>
  defaultCalendar: string | null
  setDefaultCalendar: (slug: string | null) => Promise<void>
  calendarDir: string
  setCalendarDir: (path: string) => Promise<void>
  notificationsEnabled: boolean
  setNotificationsEnabled: (enabled: boolean) => Promise<void>
  autoSyncEnabled: boolean
  setAutoSyncEnabled: (enabled: boolean) => Promise<void>
}

const SettingsContext = createContext({} as SettingsContextType)

export function useSettings() {
  return useContext(SettingsContext)
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [timeFormat, setTimeFormatState] = useState<TimeFormat>("24h")
  const [defaultReminders, setDefaultRemindersState] = useState<number[]>([])
  const [defaultCalendar, setDefaultCalendarState] = useState<string | null>(null)
  const [calendarDir, setCalendarDirState] = useState<string>("")
  const [notificationsEnabled, setNotificationsEnabledState] = useState<boolean>(true)
  const [autoSyncEnabled, setAutoSyncEnabledState] = useState<boolean>(true)

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const [tf, reminders, cal, dir, notifs, autoSync] = await Promise.all([
          rpc.caldir.get_time_format(),
          rpc.caldir.get_default_reminders(),
          rpc.caldir.get_default_calendar(),
          rpc.caldir.get_calendar_dir(),
          rpc.config.get_notifications_enabled(),
          rpc.config.get_auto_sync_enabled(),
        ])
        setTimeFormatState(tf)
        setDefaultRemindersState(reminders)
        setDefaultCalendarState(cal)
        setCalendarDirState(dir)
        setNotificationsEnabledState(notifs)
        setAutoSyncEnabledState(autoSync)
      } catch (e) {
        console.error(e)
      }
    }
    void loadSettings()

    const unlistenTimeFormat = listen<TimeFormat>(TIME_FORMAT_CHANGED, (event) => {
      setTimeFormatState(event.payload)
    })
    const unlistenReminders = listen<number[]>(DEFAULT_REMINDERS_CHANGED, (event) => {
      setDefaultRemindersState(event.payload)
    })
    const unlistenDefaultCalendar = listen<string | null>(DEFAULT_CALENDAR_CHANGED, (event) => {
      setDefaultCalendarState(event.payload)
    })
    const unlistenCalendarDir = listen<string>(CALENDAR_DIR_CHANGED, (event) => {
      setCalendarDirState(event.payload)
    })
    const unlistenNotifications = listen<boolean>(NOTIFICATIONS_ENABLED_CHANGED, (event) => {
      setNotificationsEnabledState(event.payload)
    })
    const unlistenAutoSync = listen<boolean>(AUTO_SYNC_ENABLED_CHANGED, (event) => {
      setAutoSyncEnabledState(event.payload)
    })

    return () => {
      unlistenTimeFormat.then((fn) => fn())
      unlistenReminders.then((fn) => fn())
      unlistenDefaultCalendar.then((fn) => fn())
      unlistenCalendarDir.then((fn) => fn())
      unlistenNotifications.then((fn) => fn())
      unlistenAutoSync.then((fn) => fn())
    }
  }, [])

  const setTimeFormat = async (tf: TimeFormat) => {
    setTimeFormatState(tf)
    await rpc.caldir.set_time_format(tf)
    await emit(TIME_FORMAT_CHANGED, tf)
  }

  const setDefaultReminders = async (mins: number[]) => {
    setDefaultRemindersState(mins)
    await rpc.caldir.set_default_reminders(mins)
    await emit(DEFAULT_REMINDERS_CHANGED, mins)
  }

  const setDefaultCalendar = async (slug: string | null) => {
    setDefaultCalendarState(slug)
    await rpc.caldir.set_default_calendar(slug)
    await emit(DEFAULT_CALENDAR_CHANGED, slug)
  }

  const setCalendarDir = async (path: string) => {
    await rpc.caldir.set_calendar_dir(path)
    const stored = await rpc.caldir.get_calendar_dir()
    setCalendarDirState(stored)
    await emit(CALENDAR_DIR_CHANGED, stored)
  }

  const setNotificationsEnabled = async (enabled: boolean) => {
    setNotificationsEnabledState(enabled)
    await rpc.config.set_notifications_enabled(enabled)
    await emit(NOTIFICATIONS_ENABLED_CHANGED, enabled)
  }

  const setAutoSyncEnabled = async (enabled: boolean) => {
    setAutoSyncEnabledState(enabled)
    await rpc.config.set_auto_sync_enabled(enabled)
    await emit(AUTO_SYNC_ENABLED_CHANGED, enabled)
  }

  return (
    <SettingsContext.Provider
      value={{
        timeFormat,
        setTimeFormat,
        defaultReminders,
        setDefaultReminders,
        defaultCalendar,
        setDefaultCalendar,
        calendarDir,
        setCalendarDir,
        notificationsEnabled,
        setNotificationsEnabled,
        autoSyncEnabled,
        setAutoSyncEnabled,
      }}
    >
      {children}
    </SettingsContext.Provider>
  )
}
