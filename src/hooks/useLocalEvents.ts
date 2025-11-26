import { addMonths, endOfMonth, format, startOfMonth, subMonths } from "date-fns"
import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react"

import { logger } from "@/lib/logger"

import { useCalendar } from "@/contexts/CalendarContext"
import { useStorage } from "@/contexts/StorageContext"
import { CalendarEvent } from "@/storage/models/calendarEvent"

// How many months before/after activeDate to load
const LOAD_RANGE_MONTHS = 2
// Buffer zone - only reload when activeDate is within this many months of the edge
const BUFFER_MONTHS = 1

interface DateRange {
  start: Date
  end: Date
}

export const useLocalEvents = () => {
  const { store } = useStorage()
  const { calendars, activeDate } = useCalendar()

  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [isLoading, setLoading] = useState(true)

  const dateRangeRef = useRef<DateRange | null>(null)

  const selectedCalendarIdsRef = useRef<string[]>([])
  const selectedCalendarIds = calendars.filter((c) => c.selected).map((c) => c.id)
  const selectedCalendarIdsKey = selectedCalendarIds.join(",")

  const calculateRange = useCallback((centerDate: Date): DateRange => {
    return {
      start: startOfMonth(subMonths(centerDate, LOAD_RANGE_MONTHS)),
      end: endOfMonth(addMonths(centerDate, LOAD_RANGE_MONTHS)),
    }
  }, [])

  const isWithinLoadedRange = useCallback((date: Date, range: DateRange): boolean => {
    const bufferStart = addMonths(range.start, BUFFER_MONTHS)
    const bufferEnd = subMonths(range.end, BUFFER_MONTHS)
    return date >= bufferStart && date <= bufferEnd
  }, [])

  const mergeEvents = useCallback(
    (existing: CalendarEvent[], newEvents: CalendarEvent[]): CalendarEvent[] => {
      const existingIds = new Set(existing.map((e) => e.id))
      const uniqueNewEvents = newEvents.filter((e) => !existingIds.has(e.id))

      if (uniqueNewEvents.length === 0) {
        return existing
      }

      return [...existing, ...uniqueNewEvents].sort((a, b) => a.start.getTime() - b.start.getTime())
    },
    [],
  )

  const expandLoadedRange = useCallback(
    (current: DateRange | null, newRange: DateRange): DateRange => {
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
    async (range: DateRange, replace = false) => {
      if (selectedCalendarIds.length === 0) {
        setEvents([])
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        const localEvents = await store.event.getByDateRange(
          selectedCalendarIds,
          range.start.toISOString(),
          range.end.toISOString(),
        )

        logger.debug(
          `📅 Events loaded: ${format(range.start, "yyyy-MM-dd")} to ${format(range.end, "yyyy-MM-dd")}`,
        )

        if (replace) {
          // Full replace (used for initial load or calendar selection change)
          setEvents(localEvents)
          dateRangeRef.current = range
        } else {
          // Append-only merge
          setEvents((prev) => mergeEvents(prev, localEvents))
          dateRangeRef.current = expandLoadedRange(dateRangeRef.current, range)
        }
      } catch (error) {
        logger.error("📅 Failed to load events from local DB:", error)
        setEvents([])
      } finally {
        setLoading(false)
      }
    },
    [selectedCalendarIdsKey, store, mergeEvents, expandLoadedRange],
  )

  const maybeLoadMore = useEffectEvent((date: Date) => {
    const currentRange = dateRangeRef.current

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
      dateRangeRef.current = null
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
      const currentRange = dateRangeRef.current

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
    const range = dateRangeRef.current ?? calculateRange(activeDate)
    void loadEventsForRange(range, true) // replace to get fresh data
  }, [activeDate, calculateRange, loadEventsForRange])

  return {
    events,
    isLoading,
    refreshEvents,
    loadEventsForDate,
  }
}
