import { addMonths, endOfMonth, startOfMonth, subMonths } from "date-fns"
import { RefObject, useCallback } from "react"

import { rpc } from "@/rpc"

import { useCalEvents } from "@/contexts/CalEventsContext"
import { useCalendarState } from "@/contexts/CalendarStateContext"

import { useScrollBoundary } from "@/hooks/useScrollBoundary"
import { MONTHS_TO_LOAD } from "@/lib/cal-events-range"

import { eventDtoToCalendarEvent } from "@/db/types"

export const useCalEventsInfiniteScroll = ({
  scrollContainerRef,
}: {
  scrollContainerRef: RefObject<HTMLDivElement | null>
}) => {
  const { calendars } = useCalendarState()
  const { currentDateRangeRef, setCalendarEvents } = useCalEvents()

  const visibleCalendarSlugs = calendars.filter((c) => c.isVisible).map((c) => c.slug)

  const onNearTop = useCallback(async () => {
    const currentRange = currentDateRangeRef.current
    if (!currentRange) return

    // Load all events from caldir and filter by date range
    const prevStart = startOfMonth(subMonths(currentRange.start, MONTHS_TO_LOAD))
    const prevRange = { start: prevStart, end: currentRange.start }

    try {
      const eventDtos = await rpc.caldir.list_all_events()
      const allEvents = eventDtos
        .map(eventDtoToCalendarEvent)
        .filter((e) => visibleCalendarSlugs.includes(e.calendarSlug))

      // Filter events within the previous range
      const prevEvents = allEvents.filter(
        (e) => e.start >= prevRange.start && e.start < prevRange.end,
      )

      setCalendarEvents((prev) => {
        const existingIds = new Set(prev.map((e) => e.id))
        const newEvents = prevEvents.filter((e) => !existingIds.has(e.id))

        if (newEvents.length) {
          return [...newEvents, ...prev]
        } else {
          return prev
        }
      })

      currentDateRangeRef.current = {
        start: prevStart,
        end: currentRange.end,
      }
    } catch (error) {
      console.error("Failed to load events:", error)
    }
  }, [visibleCalendarSlugs])

  const onNearBottom = useCallback(async () => {
    const currentRange = currentDateRangeRef.current
    if (!currentRange) return

    // Load all events from caldir and filter by date range
    const nextEnd = endOfMonth(addMonths(currentRange.end, MONTHS_TO_LOAD))
    const nextRange = { start: currentRange.end, end: nextEnd }

    try {
      const eventDtos = await rpc.caldir.list_all_events()
      const allEvents = eventDtos
        .map(eventDtoToCalendarEvent)
        .filter((e) => visibleCalendarSlugs.includes(e.calendarSlug))

      // Filter events within the next range
      const nextEvents = allEvents.filter(
        (e) => e.start >= nextRange.start && e.start < nextRange.end,
      )

      setCalendarEvents((prev) => {
        const existingIds = new Set(prev.map((e) => e.id))
        const newEvents = nextEvents.filter((e) => !existingIds.has(e.id))

        if (newEvents.length) {
          return [...prev, ...newEvents]
        } else {
          return prev
        }
      })

      currentDateRangeRef.current = {
        start: currentRange.start,
        end: nextEnd,
      }
    } catch (error) {
      console.error("Failed to load events:", error)
    }
  }, [visibleCalendarSlugs])

  useScrollBoundary({
    scrollContainerRef,
    threshold: 200,
    onNearTop,
    onNearBottom,
  })
}
