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

import { useStorage } from "@/contexts/StorageContext"
import { Calendar as CalendarType } from "@/types/calendar"

interface CalendarContextType {
  calendars: CalendarType[]
  reloadCalendars: () => Promise<void>
  activeDate: Date
  setActiveDate: (date: Date) => void
  navigateToDate: (date: Date) => Promise<void>
  registerScrollToDate: (fn: (date: Date) => void) => void
  registerLoadEventsForDate: (fn: (date: Date) => Promise<void>) => void
  isNavigating: () => boolean
  setIsNavigating: (value: boolean) => void
}

const CalendarContext = createContext({} as CalendarContextType)

export function useCalendar() {
  return useContext(CalendarContext)
}

export function CalendarProvider({ children }: { children: ReactNode }) {
  const { store } = useStorage()
  const [activeDate, setActiveDate] = useState<Date>(new Date())
  const [calendars, setCalendars] = useState<CalendarType[]>([])

  const scrollToDateRef = useRef<((date: Date) => void) | null>(null)
  const loadEventsForDateRef = useRef<((date: Date) => Promise<void>) | null>(null)
  const isNavigatingRef = useRef(false)
  const navigationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const loadCalendarsFromStore = async () => {
    const calendars = await store.calendar.list()
    logger.debug("🗓️ Calendars loaded from store:", calendars.length)
    setCalendars(calendars)
  }

  useEffect(() => {
    void loadCalendarsFromStore()
  }, [])

  const registerScrollToDate = useCallback((fn: (date: Date) => void) => {
    scrollToDateRef.current = fn
  }, [])

  const registerLoadEventsForDate = useCallback((fn: (date: Date) => Promise<void>) => {
    loadEventsForDateRef.current = fn
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
    reloadCalendars: loadCalendarsFromStore,
    activeDate,
    setActiveDate,
    navigateToDate,
    registerScrollToDate,
    registerLoadEventsForDate,
    isNavigating,
    setIsNavigating,
  }

  return <CalendarContext.Provider value={value}>{children}</CalendarContext.Provider>
}
