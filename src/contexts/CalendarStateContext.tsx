import {
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react"

import { rpc } from "@/rpc"

import { logger } from "@/lib/logger"

import type { Calendar } from "@/db/types"

interface CalendarStateContextType {
  calendars: Calendar[]
  reloadCalendars: () => Promise<void>
  toggleCalendarVisibility: (slug: string) => void
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

// Simple in-memory visibility state (for PoC - later will use SQLite)
const visibilityCache = new Map<string, boolean>()

export function CalendarStateProvider({ children }: { children: ReactNode }) {
  const [activeDate, setActiveDate] = useState<Date>(new Date())
  const [calendars, setCalendars] = useState<Calendar[]>([])

  const scrollToDateRef = useRef<((date: Date) => void) | null>(null)
  const loadEventsForDateRef = useRef<((date: Date) => Promise<void>) | null>(null)
  const isNavigatingRef = useRef(false)
  const navigationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const loadCalendarsFromCaldir = async () => {
    try {
      const caldirCalendars = await rpc.caldir.list_calendars()
      logger.debug("Calendars loaded from caldir:", caldirCalendars.length)

      // Merge with visibility state (default to visible)
      const calendarsWithVisibility: Calendar[] = caldirCalendars.map((cal) => ({
        ...cal,
        isVisible: visibilityCache.get(cal.slug) ?? true,
      }))

      setCalendars(calendarsWithVisibility)
    } catch (error) {
      logger.error("Failed to load calendars from caldir:", error)
    }
  }

  const toggleCalendarVisibility = useCallback((slug: string) => {
    setCalendars((prev) =>
      prev.map((cal) => {
        if (cal.slug === slug) {
          const newVisibility = !cal.isVisible
          visibilityCache.set(slug, newVisibility)
          return { ...cal, isVisible: newVisibility }
        }
        return cal
      }),
    )
  }, [])

  useEffect(() => {
    void loadCalendarsFromCaldir()
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
    reloadCalendars: loadCalendarsFromCaldir,
    toggleCalendarVisibility,
    activeDate,
    setActiveDate,

    navigateToDate,
    registerScrollToDate,
    isNavigating,
    setIsNavigating,
  }

  return <CalendarStateContext.Provider value={value}>{children}</CalendarStateContext.Provider>
}
