import { emit, listen } from "@tauri-apps/api/event"
import { ReactNode, createContext, useContext, useEffect, useState } from "react"

import { rpc } from "@/rpc"
import type { TimeFormat } from "@/rpc/bindings"

const TIME_FORMAT_CHANGED = "time-format-changed"
const DEFAULT_REMINDERS_CHANGED = "default-reminders-changed"

interface SettingsContextType {
  timeFormat: TimeFormat
  setTimeFormat: (tf: TimeFormat) => Promise<void>
  defaultReminders: number[]
  setDefaultReminders: (mins: number[]) => Promise<void>
}

const SettingsContext = createContext({} as SettingsContextType)

export function useSettings() {
  return useContext(SettingsContext)
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [timeFormat, setTimeFormatState] = useState<TimeFormat>("24h")
  const [defaultReminders, setDefaultRemindersState] = useState<number[]>([])

  useEffect(() => {
    rpc.caldir.get_time_format().then(setTimeFormatState).catch(console.error)
    rpc.caldir.get_default_reminders().then(setDefaultRemindersState).catch(console.error)

    const unlistenTimeFormat = listen<TimeFormat>(TIME_FORMAT_CHANGED, (event) => {
      setTimeFormatState(event.payload)
    })
    const unlistenReminders = listen<number[]>(DEFAULT_REMINDERS_CHANGED, (event) => {
      setDefaultRemindersState(event.payload)
    })

    return () => {
      unlistenTimeFormat.then((fn) => fn())
      unlistenReminders.then((fn) => fn())
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

  return (
    <SettingsContext.Provider
      value={{ timeFormat, setTimeFormat, defaultReminders, setDefaultReminders }}
    >
      {children}
    </SettingsContext.Provider>
  )
}
