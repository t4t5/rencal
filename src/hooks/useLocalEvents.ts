import { addMonths, endOfMonth, format, startOfMonth, subMonths } from "date-fns"
import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react"

import { Event } from "@/rpc/bindings"

import { logger } from "@/lib/logger"

import { useCalendar } from "@/contexts/CalendarContext"
import { getDb } from "@/db/connection"

// How many months before/after activeDate to load
const LOAD_RANGE_MONTHS = 2
// Buffer zone - only reload when activeDate is within this many months of the edge
const BUFFER_MONTHS = 1

interface LoadedRange {
  start: Date
  end: Date
}

export const useLocalEvents = () => {
  const { calendars, activeDate } = useCalendar()
  const [events, setEvents] = useState<Event[]>([])
  const [isLoading, setLoading] = useState(true)
  const loadedRangeRef = useRef<LoadedRange | null>(null)
  const selectedCalendarIdsRef = useRef<string[]>([])

  const selectedCalendarIds = calendars.filter((c) => c.selected).map((c) => c.id)
  const selectedCalendarIdsKey = selectedCalendarIds.join(",")

  const calculateRange = useCallback((centerDate: Date): LoadedRange => {
    return {
      start: startOfMonth(subMonths(centerDate, LOAD_RANGE_MONTHS)),
      end: endOfMonth(addMonths(centerDate, LOAD_RANGE_MONTHS)),
    }
  }, [])

  const isWithinLoadedRange = useCallback((date: Date, range: LoadedRange): boolean => {
    const bufferStart = addMonths(range.start, BUFFER_MONTHS)
    const bufferEnd = subMonths(range.end, BUFFER_MONTHS)
    return date >= bufferStart && date <= bufferEnd
  }, [])

  const mergeEvents = useCallback((existing: Event[], newEvents: Event[]): Event[] => {
    const existingIds = new Set(existing.map((e) => e.id))
    const uniqueNewEvents = newEvents.filter((e) => !existingIds.has(e.id))

    if (uniqueNewEvents.length === 0) {
      return existing
    }

    return [...existing, ...uniqueNewEvents].sort((a, b) => a.start.localeCompare(b.start))
  }, [])

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
          `Loaded events for ${format(range.start, "yyyy-MM-dd")}-${format(range.end, "yyyy-MM-dd")}`,
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

  const maybeLoadMore = useEffectEvent((date: Date) => {
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

    const newRange = calculateRange(date)
    void loadEventsForRange(newRange, false) // append, don't replace
  })

  // Initial load or when selected calendars change
  const onCalendarSelectionChange = useEffectEvent(() => {
    // Reset everything when calendar selection changes
    const prevIds = selectedCalendarIdsRef.current.join(",")
    if (prevIds !== selectedCalendarIdsKey) {
      loadedRangeRef.current = null
      selectedCalendarIdsRef.current = selectedCalendarIds
    }

    const range = calculateRange(activeDate)
    void loadEventsForRange(range, true) // replace on initial load
  })

  useEffect(() => {
    onCalendarSelectionChange()
  }, [selectedCalendarIdsKey])

  // Watch activeDate changes and load more if needed
  useEffect(() => {
    maybeLoadMore(activeDate)
  }, [activeDate])

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
