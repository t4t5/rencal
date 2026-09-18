import { ReactNode, useCallback, useEffect, useState } from "react"

import { api, type CaldirSettings } from "@/lib/api"
import { emitAppEvent } from "@/lib/api/internal"
import type { CalendarGroups } from "@/lib/calendar-groups"
import type { FirstDayOfWeek, TimeFormat } from "@/lib/event-time"
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
  groups: CalendarGroups
  setGroups: (groups: CalendarGroups) => Promise<void>
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
  const [groups, setGroupsState] = useState<CalendarGroups>({})
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
        api.settings.getCaldirSettings(),
        api.settings.getNotificationsEnabled(),
        api.settings.getAutoSyncEnabled(),
        api.settings.getFirstDayOfWeek(),
        api.settings.getShowWeekNumbers(),
        api.settings.getCalendarGroups(),
      ])
      applyCaldirSettings(caldir)
      setNotificationsEnabledState(notifs)
      setAutoSyncEnabledState(autoSync)
      setFirstDayOfWeekState(firstDay)
      setShowWeekNumbersState(weekNumbers)
      setGroupsState(groupsResult)
      setSettingsLoaded(true)
    } catch (e) {
      console.error(e)
    }
  }, [applyCaldirSettings])

  useEffect(() => {
    void reloadSettings()

    const unlistenCaldirConfig = api.notifications.listen("caldir-config-changed", (event) => {
      applyCaldirSettings(event)
    })
    // config.toml-backed settings (groups, notifications, auto-sync) don't get
    // per-field events; any change to the file — a hand-edit or our own write —
    // fires this and we re-read everything.
    const unlistenConfig = api.notifications.listen("rencal-config-changed", () => {
      void reloadSettings()
    })

    return () => {
      unlistenCaldirConfig.unlisten()
      unlistenConfig.unlisten()
    }
  }, [applyCaldirSettings, reloadSettings])

  const setTimeFormat = async (tf: TimeFormat) => {
    setTimeFormatState(tf)
    await api.settings.setTimeFormat(tf)
  }

  const setDefaultReminders = async (mins: number[]) => {
    setDefaultRemindersState(mins)
    await api.settings.setDefaultReminders(mins)
  }

  const setDefaultCalendar = async (slug: string | null) => {
    setDefaultCalendarState(slug)
    await api.settings.setDefaultCalendar(slug)
  }

  // The state bridge broadcasts the complete stored settings after the save.
  const setCalendarDir = async (path: string) => {
    await api.settings.setCalendarDir(path)
  }

  const setNotificationsEnabled = async (enabled: boolean) => {
    setNotificationsEnabledState(enabled)
    await api.settings.setNotificationsEnabled(enabled)
    await emitAppEvent("rencal-config-changed")
  }

  const setFirstDayOfWeek = async (day: FirstDayOfWeek) => {
    setFirstDayOfWeekState(day)
    await api.settings.setFirstDayOfWeek(day)
    await emitAppEvent("rencal-config-changed")
  }

  const setShowWeekNumbers = async (show: boolean) => {
    setShowWeekNumbersState(show)
    await api.settings.setShowWeekNumbers(show)
    await emitAppEvent("rencal-config-changed")
  }

  const setAutoSyncEnabled = async (enabled: boolean) => {
    setAutoSyncEnabledState(enabled)
    await api.settings.setAutoSyncEnabled(enabled)
    await emitAppEvent("rencal-config-changed")
  }

  const setGroups = async (nextGroups: CalendarGroups) => {
    setGroupsState(nextGroups)
    await api.settings.setCalendarGroups(nextGroups)
    await emitAppEvent("rencal-config-changed")
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
