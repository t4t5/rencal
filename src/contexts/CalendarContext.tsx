import { ReactNode, createContext, useContext, useEffect, useState } from "react"

import { Calendar as CalendarType } from "@/rpc/bindings"

import { logger } from "@/lib/logger"

import { getDb } from "@/db/connection"

interface CalendarContextType {
  calendars: CalendarType[]
  updateCalendars: (calendars: CalendarType[]) => void
}

const CalendarContext = createContext({} as CalendarContextType)

export function useCalendar() {
  return useContext(CalendarContext)
}

export function CalendarProvider({ children }: { children: ReactNode }) {
  const [calendars, setCalendars] = useState<CalendarType[]>([])

  // const loadCalendarsFromDb = async () => {
  //   logger.info("Load calendars from DB...")
  //   const db = await getDb()
  //   const calendars = await db.calendar.list()
  //   logger.info("Setting calendars:", calendars)
  //   setCalendars(calendars)
  // }
  //
  // useEffect(() => {
  //   void loadCalendarsFromDb()
  // }, [])

  const updateCalendars = async (calendars: CalendarType[]) => {
    // const db = await getDb()

    // for (const calendar of calendars) {
    //   await db.calendar.add(calendar)
    // }

    setCalendars(calendars)
  }

  const value = {
    calendars,
    updateCalendars,
  }

  return <CalendarContext.Provider value={value}>{children}</CalendarContext.Provider>
}
