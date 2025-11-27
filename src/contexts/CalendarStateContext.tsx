import {
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react"

import { logger } from "@/lib/logger"

import { schema, db } from "@/db/database"
import type { Calendar } from "@/db/types"

interface CalendarStateContextType {
  calendars: Calendar[]
  reloadCalendars: () => Promise<void>
  activeDate: Date
  setActiveDate: (date: Date) => void
  navigateToDate: (date: Date) => Promise<void>
  registerScrollToDate: (fn: (date: Date) => void) => void
  isNavigating: () => boolean
  setIsNavigating: (value: boolean) => void
}

const CalendarStateContext = createContext({} as CalendarStateContextType)

export function useCalendarState() {
  return useContext(CalendarStateContext)
}

export function CalendarStateProvider({ children }: { children: ReactNode }) {
  const [activeDate, setActiveDate] = useState<Date>(new Date())
  const [calendars, setCalendars] = useState<Calendar[]>([])

  const scrollToDateRef = useRef<((date: Date) => void) | null>(null)
  const loadEventsForDateRef = useRef<((date: Date) => Promise<void>) | null>(null)
  const isNavigatingRef = useRef(false)
  const navigationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const loadCalendarsFromStore = async () => {
    const result = await db.select().from(schema.calendars)
    logger.debug("Calendars loaded from store:", result.length)
    setCalendars(result)
  }

  useEffect(() => {
    void loadCalendarsFromStore()
  }, [])

  const registerScrollToDate = useCallback((fn: (date: Date) => void) => {
    scrollToDateRef.current = fn
  }, [])

  const isNavigating = useCallback(() => isNavigatingRef.current, [])

  const setIsNavigating = useCallback((value: boolean) => {
    isNavigatingRef.current = value
  }, [])

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

    // Use requestAnimationFrame to ensure DOM has updated before scrolling
    requestAnimationFrame(() => {
      setActiveDate(date)
      scrollToDateRef.current?.(date)
    })

    // Clear flag after scroll animation completes
    navigationTimeoutRef.current = setTimeout(() => {
      isNavigatingRef.current = false
    }, 500)
  }, [])

  const value = {
    calendars,
    reloadCalendars: loadCalendarsFromStore,
    activeDate,
    setActiveDate,
    navigateToDate,
    registerScrollToDate,
    isNavigating,
    setIsNavigating,
  }

  return <CalendarStateContext.Provider value={value}>{children}</CalendarStateContext.Provider>
}
