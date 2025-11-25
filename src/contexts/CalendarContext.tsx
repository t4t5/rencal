import {
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react"

import { Calendar as CalendarType } from "@/rpc/bindings"

import { logger } from "@/lib/logger"

import { getDb } from "@/db/connection"

interface CalendarContextType {
  calendars: CalendarType[]
  saveCalendars: (calendars: CalendarType[]) => Promise<void>
  activeDate: Date
  setActiveDate: (date: Date) => void
  navigateToDate: (date: Date) => Promise<void>
  registerScrollToDate: (fn: (date: Date) => void) => void
  registerLoadEventsForDate: (fn: (date: Date) => Promise<void>) => void
  isNavigating: () => boolean
}

const CalendarContext = createContext({} as CalendarContextType)

export function useCalendar() {
  return useContext(CalendarContext)
}

export function CalendarProvider({ children }: { children: ReactNode }) {
  const [activeDate, setActiveDate] = useState<Date>(new Date())
  const scrollToDateRef = useRef<((date: Date) => void) | null>(null)
  const loadEventsForDateRef = useRef<((date: Date) => Promise<void>) | null>(null)
  const isNavigatingRef = useRef(false)
  const navigationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [calendars, setCalendars] = useState<CalendarType[]>([])

  const loadCalendarsFromDb = async () => {
    logger.info("Load calendars from DB...")
    const db = await getDb()
    const calendars = await db.calendar.list()
    logger.info("Setting calendars:", calendars)
    setCalendars(calendars)
  }

  useEffect(() => {
    void loadCalendarsFromDb()
  }, [])

  const saveCalendars = async (calendars: CalendarType[]) => {
    const db = await getDb()

    logger.info("Saving calendars to DB...")

    for (const calendar of calendars) {
      await db.calendar.add(calendar)
    }

    logger.info(`Saved ${calendars.length} calendars to DB!`)

    setCalendars(calendars)
  }

  const registerScrollToDate = useCallback((fn: (date: Date) => void) => {
    scrollToDateRef.current = fn
  }, [])

  const registerLoadEventsForDate = useCallback((fn: (date: Date) => Promise<void>) => {
    loadEventsForDateRef.current = fn
  }, [])

  const isNavigating = useCallback(() => isNavigatingRef.current, [])

  const navigateToDate = useCallback(async (date: Date) => {
    // Cancel any pending timeout from a previous navigation
    if (navigationTimeoutRef.current) {
      clearTimeout(navigationTimeoutRef.current)
    }

    isNavigatingRef.current = true

    // Load events for the target date first (this handles distant date navigation)
    if (loadEventsForDateRef.current) {
      await loadEventsForDateRef.current(date)
    }

    // setActiveDate(date)

    // Use requestAnimationFrame to ensure DOM has updated before scrolling
    requestAnimationFrame(() => {
      setActiveDate(date) // moved it to here. seems to work.
      scrollToDateRef.current?.(date)
    })

    // Clear flag after scroll animation completes
    navigationTimeoutRef.current = setTimeout(() => {
      isNavigatingRef.current = false
    }, 500)
  }, [])

  const value = {
    calendars,
    saveCalendars,
    activeDate,
    setActiveDate,
    navigateToDate,
    registerScrollToDate,
    registerLoadEventsForDate,
    isNavigating,
  }

  return <CalendarContext.Provider value={value}>{children}</CalendarContext.Provider>
}
