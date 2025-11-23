import { addMonths, endOfMonth, startOfMonth, subMonths } from "date-fns"
import { useCallback, useEffect, useRef, useState } from "react"

import { Event } from "@/rpc/bindings"

import { logger } from "@/lib/logger"

import { useCalendar } from "@/contexts/CalendarContext"
import { getDb } from "@/db/connection"

// How many months before/after activeDate to load
const LOAD_RANGE_MONTHS = 2
// Buffer zone - only reload when activeDate is within this many months of the edge
const BUFFER_MONTHS = 1
// Debounce delay for scroll-triggered loads (ms)
const DEBOUNCE_MS = 300

interface LoadedRange {
  start: Date
  end: Date
}

/**
 * Hook that reads events from local SQLite database with infinite scroll.
 * Loads a sliding window of events around the activeDate.
 * Use together with useSyncEvents to keep events up-to-date.
 */
export const useLocalEvents = () => {
  const { calendars, activeDate } = useCalendar()
  const [events, setEvents] = useState<Event[]>([])
  const [isLoading, setLoading] = useState(true)
  const loadedRangeRef = useRef<LoadedRange | null>(null)
  const debounceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const selectedCalendarIds = calendars.filter((c) => c.selected).map((c) => c.id)

  /**
   * Calculate the date range to load based on a center date
   */
  const calculateRange = useCallback((centerDate: Date): LoadedRange => {
    return {
      start: startOfMonth(subMonths(centerDate, LOAD_RANGE_MONTHS)),
      end: endOfMonth(addMonths(centerDate, LOAD_RANGE_MONTHS)),
    }
  }, [])

  /**
   * Check if a date is within the "safe zone" of the loaded range
   * (at least BUFFER_MONTHS away from edges)
   */
  const isWithinSafeZone = useCallback((date: Date, range: LoadedRange): boolean => {
    const bufferStart = addMonths(range.start, BUFFER_MONTHS)
    const bufferEnd = subMonths(range.end, BUFFER_MONTHS)
    return date >= bufferStart && date <= bufferEnd
  }, [])

  /**
   * Load events for a specific date range
   */
  const loadEventsForRange = useCallback(
    async (range: LoadedRange) => {
      if (selectedCalendarIds.length === 0) {
        setEvents([])
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        const db = await getDb()
        const localEvents = await db.event.getByDateRange(
          selectedCalendarIds,
          range.start.toISOString(),
          range.end.toISOString(),
        )

        logger.info(
          `Loaded ${localEvents.length} events for range ${range.start.toISOString().slice(0, 10)} to ${range.end.toISOString().slice(0, 10)}`,
        )
        setEvents(localEvents)
        loadedRangeRef.current = range
      } catch (error) {
        logger.error("Failed to load events from local DB:", error)
        setEvents([])
      } finally {
        setLoading(false)
      }
    },
    [selectedCalendarIds.join(",")],
  )

  /**
   * Check if we need to load more events based on activeDate
   */
  const maybeLoadMore = useCallback(
    (date: Date, immediate = false) => {
      const currentRange = loadedRangeRef.current

      // If no range loaded yet, load immediately
      if (!currentRange) {
        const newRange = calculateRange(date)
        void loadEventsForRange(newRange)
        return
      }

      // If within safe zone, no need to load
      if (isWithinSafeZone(date, currentRange)) {
        return
      }

      // Need to load new range - debounce unless immediate
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current)
      }

      const doLoad = () => {
        const newRange = calculateRange(date)
        logger.info(`Loading new range centered on ${date.toISOString().slice(0, 10)}`)
        void loadEventsForRange(newRange)
      }

      if (immediate) {
        doLoad()
      } else {
        debounceTimeoutRef.current = setTimeout(doLoad, DEBOUNCE_MS)
      }
    },
    [calculateRange, isWithinSafeZone, loadEventsForRange],
  )

  // Initial load
  useEffect(() => {
    const range = calculateRange(activeDate)
    void loadEventsForRange(range)

    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current)
      }
    }
  }, [selectedCalendarIds.join(",")])

  // Watch activeDate changes and load more if needed
  useEffect(() => {
    maybeLoadMore(activeDate)
  }, [activeDate, maybeLoadMore])

  /**
   * Force load events for a specific date (used for navigation to distant dates)
   */
  const loadEventsForDate = useCallback(
    async (date: Date) => {
      const range = calculateRange(date)
      await loadEventsForRange(range)
    },
    [calculateRange, loadEventsForRange],
  )

  /**
   * Refresh events within the current loaded range
   */
  const refreshEvents = useCallback(() => {
    const range = loadedRangeRef.current ?? calculateRange(activeDate)
    void loadEventsForRange(range)
  }, [activeDate, calculateRange, loadEventsForRange])

  return {
    events,
    isLoading,
    refreshEvents,
    loadEventsForDate,
  }
}
