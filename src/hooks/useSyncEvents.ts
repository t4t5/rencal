import { useCallback, useEffect, useRef } from "react"

import { rpc } from "@/rpc"
import { Calendar } from "@/rpc/bindings"

import { logger } from "@/lib/logger"

import { useAuth } from "@/contexts/AuthContext"
import { useCalendar } from "@/contexts/CalendarContext"
import { getDb } from "@/db/connection"

const SYNC_INTERVAL_MS = 30_000 // 30 seconds

/**
 * Hook that handles syncing events from Google Calendar to local SQLite.
 * - Syncs on mount and when auth/calendars change
 * - Periodically syncs every 30 seconds
 * - Uses incremental sync when possible (sync tokens)
 * - Falls back to full sync when sync token expires
 */
export const useSyncEvents = (options?: { onSyncComplete?: () => void }) => {
  const { accessToken, refreshSession } = useAuth()
  const { calendars, updateCalendars } = useCalendar()
  const isSyncingRef = useRef(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const selectedCalendars = calendars.filter((c) => c.selected && c.google_calendar_id)

  const syncCalendar = useCallback(async (calendar: Calendar, token: string): Promise<Calendar> => {
    if (!calendar.google_calendar_id) {
      return calendar
    }

    const db = await getDb()

    logger.info(`Syncing calendar: ${calendar.name}`, {
      hasToken: !!calendar.sync_token,
    })

    const result = await rpc.sync_google_events(
      token,
      calendar.google_calendar_id,
      calendar.id,
      calendar.sync_token,
    )

    // Handle 410 Gone - need full re-sync
    if (result.full_sync_required) {
      logger.warn(`Sync token expired for ${calendar.name}, doing full sync...`)
      // Clear events and sync token, then retry
      await db.event.deleteByCalendarId(calendar.id)
      await db.calendar.updateSyncState(calendar.id, null)

      // Retry with no sync token (full sync)
      const fullResult = await rpc.sync_google_events(
        token,
        calendar.google_calendar_id,
        calendar.id,
        null,
      )

      if (fullResult.events.length > 0) {
        await db.event.upsertMany(fullResult.events)
      }

      if (fullResult.sync_token) {
        await db.calendar.updateSyncState(calendar.id, fullResult.sync_token)
      }

      return {
        ...calendar,
        sync_token: fullResult.sync_token,
        last_synced_at: String(Date.now()),
      }
    }

    // Handle deleted events
    if (result.deleted_event_ids.length > 0) {
      logger.info(`Deleting ${result.deleted_event_ids.length} events from ${calendar.name}`)
      await db.event.deleteByGoogleEventIds(result.deleted_event_ids, calendar.id)
    }

    // Upsert new/updated events
    if (result.events.length > 0) {
      logger.info(`Upserting ${result.events.length} events to ${calendar.name}`)
      await db.event.upsertMany(result.events)
    }

    // Update sync token
    if (result.sync_token) {
      await db.calendar.updateSyncState(calendar.id, result.sync_token)
    }

    logger.info(`Sync complete for ${calendar.name}`)

    return {
      ...calendar,
      sync_token: result.sync_token ?? calendar.sync_token,
      last_synced_at: String(Date.now()),
    }
  }, [])

  const syncAllCalendars = useCallback(
    async (token: string, retries = 0) => {
      if (isSyncingRef.current) {
        logger.info("Sync already in progress, skipping...")
        return
      }

      if (selectedCalendars.length === 0) {
        logger.info("No calendars selected, skipping sync")
        return
      }

      isSyncingRef.current = true

      try {
        logger.info(`Starting sync for ${selectedCalendars.length} calendars...`)

        const updatedCalendars: Calendar[] = []

        for (const calendar of selectedCalendars) {
          try {
            const updated = await syncCalendar(calendar, token)
            updatedCalendars.push(updated)
          } catch (error) {
            logger.error(`Failed to sync calendar ${calendar.name}:`, error)

            // Check for 401 - token expired
            if (typeof error === "string" && error.includes("401") && retries < 1) {
              logger.warn("Token expired during sync, refreshing...")
              const newToken = await refreshSession()
              if (newToken) {
                isSyncingRef.current = false
                return syncAllCalendars(newToken, retries + 1)
              }
            }

            // Keep calendar unchanged on error
            updatedCalendars.push(calendar)
          }
        }

        // Update calendars in context with new sync states
        const allCalendars = calendars.map((c) => {
          const updated = updatedCalendars.find((u) => u.id === c.id)
          return updated ?? c
        })
        await updateCalendars(allCalendars)

        logger.info("All calendars synced successfully")
        options?.onSyncComplete?.()
      } catch (error) {
        logger.error("Sync failed:", error)
      } finally {
        isSyncingRef.current = false
      }
    },
    [selectedCalendars, calendars, syncCalendar, refreshSession, updateCalendars, options],
  )

  // Initial sync and setup interval
  useEffect(() => {
    if (!accessToken || selectedCalendars.length === 0) {
      return
    }

    // Sync immediately
    void syncAllCalendars(accessToken)

    // Set up periodic sync
    intervalRef.current = setInterval(() => {
      if (accessToken) {
        void syncAllCalendars(accessToken)
      }
    }, SYNC_INTERVAL_MS)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [accessToken, selectedCalendars.length])

  // Manual sync trigger
  const triggerSync = useCallback(() => {
    if (accessToken) {
      void syncAllCalendars(accessToken)
    }
  }, [accessToken, syncAllCalendars])

  return { triggerSync, isSyncing: isSyncingRef.current }
}
