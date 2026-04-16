import { listen } from "@tauri-apps/api/event"
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
import type { Calendar } from "@/rpc/bindings"

import { logger } from "@/lib/logger"

const CALENDAR_DIR_CHANGED = "calendar-dir-changed"

// --- Calendars context (changes rarely) ---

interface CalendarsContextType {
  calendars: Calendar[]
  isLoadingCalendars: boolean
  reloadCalendars: () => Promise<void>
}

const CalendarsContext = createContext({} as CalendarsContextType)

export function useCalendars() {
  return useContext(CalendarsContext)
}

// --- Navigation context (changes on every date navigation) ---

interface CalendarNavigationContextType {
  activeDate: Date
  setActiveDate: (date: Date) => void
  navigateToDate: (date: Date) => Promise<void>
  registerScrollToDate: (fn: (date: Date, behavior?: ScrollBehavior) => void) => void
  isNavigating: () => boolean
  setIsNavigating: (value: boolean) => void
}

const CalendarNavigationContext = createContext({} as CalendarNavigationContextType)

export function useCalendarNavigation() {
  return useContext(CalendarNavigationContext)
}

/** @deprecated Use useCalendars() or useCalendarNavigation() directly */
export function useCalendarState() {
  const calendars = useCalendars()
  const navigation = useCalendarNavigation()
  return { ...calendars, ...navigation }
}

// --- Provider ---

interface CalendarStateProviderProps {
  children: ReactNode
  initialCalendars?: Calendar[]
  initialDate?: Date
}

export function CalendarStateProvider({
  children,
  initialCalendars,
  initialDate,
}: CalendarStateProviderProps) {
  const [activeDate, setActiveDate] = useState<Date>(() => initialDate ?? new Date())
  const [calendars, setCalendars] = useState<Calendar[]>(() => initialCalendars ?? [])
  const [isLoadingCalendars, setIsLoadingCalendars] = useState(() => initialCalendars === undefined)

  const scrollToDateRef = useRef<((date: Date, behavior?: ScrollBehavior) => void) | null>(null)
  const loadEventsForDateRef = useRef<((date: Date) => Promise<void>) | null>(null)
  const isNavigatingRef = useRef(true)
  const navigationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const loadCalendarsFromStore = async () => {
    try {
      const result = await rpc.caldir.list_calendars()
      logger.debug("Calendars loaded from store:", result.length)
      setCalendars(result)
    } finally {
      setIsLoadingCalendars(false)
    }
  }

  useEffect(() => {
    if (initialCalendars === undefined) {
      void loadCalendarsFromStore()
    }

    const unlisten = listen(CALENDAR_DIR_CHANGED, () => {
      void loadCalendarsFromStore()
    })

    return () => {
      unlisten.then((fn) => fn())
    }
  }, [])

  const registerScrollToDate = useCallback((fn: (date: Date) => void) => {
    scrollToDateRef.current = fn
  }, [])

  const isNavigating = useCallback(() => isNavigatingRef.current, [])

  const setIsNavigating = useCallback((value: boolean) => {
    isNavigatingRef.current = value
  }, [])

  const lastNavigateTimeRef = useRef(0)
  const RAPID_NAV_THRESHOLD_MS = 200

  const navigateToDate = useCallback(async (date: Date) => {
    // Cancel any pending timeout from a previous navigation
    if (navigationTimeoutRef.current) {
      clearTimeout(navigationTimeoutRef.current)
    }

    // Use instant scrolling when navigations happen in quick succession
    // to avoid stacking smooth scroll animations (causes GPU artifacts)
    const now = Date.now()
    const isRapid = now - lastNavigateTimeRef.current < RAPID_NAV_THRESHOLD_MS
    lastNavigateTimeRef.current = now
    const behavior: ScrollBehavior = isRapid ? "instant" : "smooth"

    isNavigatingRef.current = true

    // Load events for the target date first (this handles distant date navigation)
    if (loadEventsForDateRef.current) {
      await loadEventsForDateRef.current(date)
    }

    // Use requestAnimationFrame to ensure DOM has updated before scrolling
    requestAnimationFrame(() => {
      setActiveDate(date)
      scrollToDateRef.current?.(date, behavior)
    })

    // Clear flag after scroll animation completes
    navigationTimeoutRef.current = setTimeout(() => {
      isNavigatingRef.current = false
    }, 500)
  }, [])

  const calendarsValue = useMemo(
    () => ({ calendars, isLoadingCalendars, reloadCalendars: loadCalendarsFromStore }),
    [calendars, isLoadingCalendars],
  )

  const navigationValue = useMemo(
    () => ({
      activeDate,
      setActiveDate,
      navigateToDate,
      registerScrollToDate,
      isNavigating,
      setIsNavigating,
    }),
    [activeDate],
  )

  return (
    <CalendarsContext.Provider value={calendarsValue}>
      <CalendarNavigationContext.Provider value={navigationValue}>
        {children}
      </CalendarNavigationContext.Provider>
    </CalendarsContext.Provider>
  )
}
