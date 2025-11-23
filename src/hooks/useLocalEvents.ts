import { useCallback, useEffect, useState } from "react"

import { Event } from "@/rpc/bindings"

import { logger } from "@/lib/logger"

import { useCalendar } from "@/contexts/CalendarContext"
import { getDb } from "@/db/connection"

/**
 * Hook that reads events from local SQLite database.
 * Events are loaded immediately on mount and when calendars change.
 * Use together with useSyncEvents to keep events up-to-date.
 */
export const useLocalEvents = () => {
  const { calendars } = useCalendar()
  const [events, setEvents] = useState<Event[]>([])
  const [isLoading, setLoading] = useState(true)

  const selectedCalendarIds = calendars.filter((c) => c.selected).map((c) => c.id)

  const loadEvents = useCallback(async () => {
    if (selectedCalendarIds.length === 0) {
      setEvents([])
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      const db = await getDb()
      const localEvents = await db.event.getByCalendarIds(selectedCalendarIds)

      logger.info(`Loaded ${localEvents.length} events from local DB`)
      setEvents(localEvents)
    } catch (error) {
      logger.error("Failed to load events from local DB:", error)
      setEvents([])
    } finally {
      setLoading(false)
    }
  }, [selectedCalendarIds.join(",")])

  // Load events on mount and when selected calendars change
  useEffect(() => {
    void loadEvents()
  }, [loadEvents])

  return {
    events,
    isLoading,
    refreshEvents: loadEvents,
  }
}
