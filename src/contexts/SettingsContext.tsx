import { emit, listen } from "@tauri-apps/api/event"
import { ReactNode, useCallback, useEffect, useState } from "react"

import { rpc } from "@/rpc"
import type { CaldirSettings, TimeFormat } from "@/rpc/bindings"
import { CALDIR_CONFIG_CHANGED, RENCAL_CONFIG_CHANGED } from "@/rpc/events"

import { normalizeCalendarGroups } from "@/lib/calendar-groups"
import type { FirstDayOfWeek } from "@/lib/event-time"
import { createStrictContext } from "@/lib/strict-context"

interface SettingsContextType {
  timeFormat: TimeFormat
  setTimeFormat: (tf: TimeFormat) => Promise<void>
  firstDayOfWeek: FirstDayOfWeek
  setFirstDayOfWeek: (day: FirstDayOfWeek) => Promise<void>
  showWeekNumbers: boolean
  setShowWeekNumbers: (show: boolean) => Promise<void>
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
  // Named calendar groups from config.toml's [groups] table. Which group is
  // active is app state — see activeGroup on useCalendars() in CalendarStateContext.
  groups: Record<string, string[]>
  setGroups: (groups: Record<string, string[]>) => Promise<void>
  reloadSettings: () => Promise<void>
  // False until persisted settings load, so startup consumers don't act on defaults.
  settingsLoaded: boolean
}

const [SettingsContextProvider, useSettings] = createStrictContext<SettingsContextType>("Settings")

export { useSettings }

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [timeFormat, setTimeFormatState] = useState<TimeFormat>("24h")
  const [firstDayOfWeek, setFirstDayOfWeekState] = useState<FirstDayOfWeek>("monday")
  const [showWeekNumbers, setShowWeekNumbersState] = useState<boolean>(false)
  const [defaultReminders, setDefaultRemindersState] = useState<number[]>([])
  const [defaultCalendar, setDefaultCalendarState] = useState<string | null>(null)
  const [calendarDir, setCalendarDirState] = useState<string>("")
  const [notificationsEnabled, setNotificationsEnabledState] = useState<boolean>(true)
  const [autoSyncEnabled, setAutoSyncEnabledState] = useState<boolean>(true)
  const [groups, setGroupsState] = useState<Record<string, string[]>>({})
  const [settingsLoaded, setSettingsLoaded] = useState<boolean>(false)

  const applyCaldirSettings = useCallback((settings: CaldirSettings) => {
    setTimeFormatState(settings.time_format)
    setDefaultRemindersState(settings.default_reminders)
    setDefaultCalendarState(settings.default_calendar)
    setCalendarDirState(settings.calendar_dir)
  }, [])

  const reloadSettings = useCallback(async () => {
    try {
      const [caldir, notifs, autoSync, firstDay, weekNumbers, groupsResult] = await Promise.all([
        rpc.caldir.get_caldir_settings(),
        rpc.config.get_notifications_enabled(),
        rpc.config.get_auto_sync_enabled(),
        rpc.config.get_first_day_of_week(),
        rpc.config.get_show_week_numbers(),
        rpc.config.get_groups(),
      ])
      applyCaldirSettings(caldir)
      setNotificationsEnabledState(notifs)
      setAutoSyncEnabledState(autoSync)
      setFirstDayOfWeekState(firstDay)
      setShowWeekNumbersState(weekNumbers)
      // The RPC type is Partial<Record<string, string[]>>; drop undefined values.
      setGroupsState(normalizeCalendarGroups(groupsResult))
      setSettingsLoaded(true)
    } catch (e) {
      console.error(e)
    }
  }, [applyCaldirSettings])

  useEffect(() => {
    void reloadSettings()

    const unlistenCaldirConfig = listen<CaldirSettings>(CALDIR_CONFIG_CHANGED, (event) => {
      applyCaldirSettings(event.payload)
    })
    // config.toml-backed settings (groups, notifications, auto-sync) don't get
    // per-field events; any change to the file — a hand-edit or our own write —
    // fires this and we re-read everything.
    const unlistenConfig = listen(RENCAL_CONFIG_CHANGED, () => {
      void reloadSettings()
    })

    return () => {
      unlistenCaldirConfig.then((fn) => fn())
      unlistenConfig.then((fn) => fn())
    }
  }, [applyCaldirSettings, reloadSettings])

  const setTimeFormat = async (tf: TimeFormat) => {
    setTimeFormatState(tf)
    await rpc.caldir.set_time_format(tf)
  }

  const setDefaultReminders = async (mins: number[]) => {
    setDefaultRemindersState(mins)
    await rpc.caldir.set_default_reminders(mins)
  }

  const setDefaultCalendar = async (slug: string | null) => {
    setDefaultCalendarState(slug)
    await rpc.caldir.set_default_calendar(slug)
  }

  // The state bridge broadcasts the complete stored settings after the save.
  const setCalendarDir = async (path: string) => {
    await rpc.caldir.set_calendar_dir(path)
  }

  const setNotificationsEnabled = async (enabled: boolean) => {
    setNotificationsEnabledState(enabled)
    await rpc.config.set_notifications_enabled(enabled)
    await emit(RENCAL_CONFIG_CHANGED)
  }

  const setFirstDayOfWeek = async (day: FirstDayOfWeek) => {
    setFirstDayOfWeekState(day)
    await rpc.config.set_first_day_of_week(day)
    await emit(RENCAL_CONFIG_CHANGED)
  }

  const setShowWeekNumbers = async (show: boolean) => {
    setShowWeekNumbersState(show)
    await rpc.config.set_show_week_numbers(show)
    await emit(RENCAL_CONFIG_CHANGED)
  }

  const setAutoSyncEnabled = async (enabled: boolean) => {
    setAutoSyncEnabledState(enabled)
    await rpc.config.set_auto_sync_enabled(enabled)
    await emit(RENCAL_CONFIG_CHANGED)
  }

  const setGroups = async (nextGroups: Record<string, string[]>) => {
    setGroupsState(nextGroups)
    await rpc.config.set_groups(nextGroups)
    await emit(RENCAL_CONFIG_CHANGED)
  }

  return (
    <SettingsContextProvider
      value={{
        timeFormat,
        setTimeFormat,
        firstDayOfWeek,
        setFirstDayOfWeek,
        showWeekNumbers,
        setShowWeekNumbers,
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
        groups,
        setGroups,
        reloadSettings,
        settingsLoaded,
      }}
    >
      {children}
    </SettingsContextProvider>
  )
}
