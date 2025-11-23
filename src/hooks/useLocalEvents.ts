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
 * Uses append-only loading - events are only added, never removed during a session.
 * Use together with useSyncEvents to keep events up-to-date.
 */
export const useLocalEvents = () => {
  const { calendars, activeDate } = useCalendar()
  const [events, setEvents] = useState<Event[]>([])
  const [isLoading, setLoading] = useState(true)
  const loadedRangeRef = useRef<LoadedRange | null>(null)
  const debounceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const selectedCalendarIdsRef = useRef<string[]>([])

  const selectedCalendarIds = calendars.filter((c) => c.selected).map((c) => c.id)
  const selectedCalendarIdsKey = selectedCalendarIds.join(",")

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
   * Check if a date is within the loaded range (with buffer)
   */
  const isWithinLoadedRange = useCallback((date: Date, range: LoadedRange): boolean => {
    const bufferStart = addMonths(range.start, BUFFER_MONTHS)
    const bufferEnd = subMonths(range.end, BUFFER_MONTHS)
    return date >= bufferStart && date <= bufferEnd
  }, [])

  /**
   * Merge new events with existing events (append-only, dedupe by ID)
   */
  const mergeEvents = useCallback((existing: Event[], newEvents: Event[]): Event[] => {
    const existingIds = new Set(existing.map((e) => e.id))
    const uniqueNewEvents = newEvents.filter((e) => !existingIds.has(e.id))

    if (uniqueNewEvents.length === 0) {
      return existing
    }

    return [...existing, ...uniqueNewEvents].sort((a, b) => a.start.localeCompare(b.start))
  }, [])

  /**
   * Expand the loaded range to include a new range
   */
  const expandLoadedRange = useCallback(
    (current: LoadedRange | null, newRange: LoadedRange): LoadedRange => {
      if (!current) {
        return newRange
      }
      return {
        start: current.start < newRange.start ? current.start : newRange.start,
        end: current.end > newRange.end ? current.end : newRange.end,
      }
    },
    [],
  )

  /**
   * Load and append events for a specific date range
   */
  const loadEventsForRange = useCallback(
    async (range: LoadedRange, replace = false) => {
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

        if (replace) {
          // Full replace (used for initial load or calendar selection change)
          setEvents(localEvents)
          loadedRangeRef.current = range
        } else {
          // Append-only merge
          setEvents((prev) => mergeEvents(prev, localEvents))
          loadedRangeRef.current = expandLoadedRange(loadedRangeRef.current, range)
        }
      } catch (error) {
        logger.error("Failed to load events from local DB:", error)
        setEvents([])
      } finally {
        setLoading(false)
      }
    },
    [selectedCalendarIdsKey, mergeEvents, expandLoadedRange],
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
        void loadEventsForRange(newRange, true)
        return
      }

      // If within loaded range (with buffer), no need to load
      if (isWithinLoadedRange(date, currentRange)) {
        return
      }

      // Need to load new range - debounce unless immediate
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current)
      }

      const doLoad = () => {
        const newRange = calculateRange(date)
        logger.info(`Loading more events centered on ${date.toISOString().slice(0, 10)}`)
        void loadEventsForRange(newRange, false) // append, don't replace
      }

      if (immediate) {
        doLoad()
      } else {
        debounceTimeoutRef.current = setTimeout(doLoad, DEBOUNCE_MS)
      }
    },
    [calculateRange, isWithinLoadedRange, loadEventsForRange],
  )

  // Initial load or when selected calendars change
  useEffect(() => {
    // Reset everything when calendar selection changes
    const prevIds = selectedCalendarIdsRef.current.join(",")
    if (prevIds !== selectedCalendarIdsKey) {
      loadedRangeRef.current = null
      selectedCalendarIdsRef.current = selectedCalendarIds
    }

    const range = calculateRange(activeDate)
    void loadEventsForRange(range, true) // replace on initial load

    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current)
      }
    }
  }, [selectedCalendarIdsKey])

  // Watch activeDate changes and load more if needed
  useEffect(() => {
    maybeLoadMore(activeDate)
  }, [activeDate, maybeLoadMore])

  /**
   * Force load events for a specific date (used for navigation to distant dates)
   */
  const loadEventsForDate = useCallback(
    async (date: Date) => {
      const currentRange = loadedRangeRef.current

      // If already within loaded range, no need to load
      if (currentRange && isWithinLoadedRange(date, currentRange)) {
        return
      }

      const range = calculateRange(date)
      await loadEventsForRange(range, false) // append, don't replace
    },
    [calculateRange, isWithinLoadedRange, loadEventsForRange],
  )

  /**
   * Refresh events within the current loaded range
   */
  const refreshEvents = useCallback(() => {
    const range = loadedRangeRef.current ?? calculateRange(activeDate)
    void loadEventsForRange(range, true) // replace to get fresh data
  }, [activeDate, calculateRange, loadEventsForRange])

  return {
    events,
    isLoading,
    refreshEvents,
    loadEventsForDate,
  }
}
