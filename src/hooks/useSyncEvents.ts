import { useCallback, useEffect, useEffectEvent, useRef } from "react"

import { rpc } from "@/rpc"
import { Calendar } from "@/rpc/bindings"

import { logger } from "@/lib/logger"

import { useAuth } from "@/contexts/AuthContext"
import { useCalendar } from "@/contexts/CalendarContext"
import { getDb } from "@/db/connection"

// const SYNC_INTERVAL_MS = 60_000 // 60s

/**
 * Hook that handles syncing events from Google Calendar to local SQLite.
 * - Syncs on mount and when auth/calendars change
 * - Periodically syncs every 30 seconds
 * - Uses incremental sync when possible (sync tokens)
 * - Falls back to full sync when sync token expires
 */
export const useSyncEvents = (options?: { onSyncComplete?: () => void }) => {
  const { withAuthRetry } = useAuth()
  const { calendars } = useCalendar()
  const isSyncingRef = useRef(false)

  const selectedCalendars = calendars.filter((c) => c.selected && c.google_calendar_id)

  const doFullSync = async ({ calendar, token }: { calendar: Calendar; token: string }) => {
    logger.warn(`Sync token expired for ${calendar.name}, doing full sync...`)

    if (!calendar.google_calendar_id) {
      throw new Error("Calendar does not have a Google Calendar ID")
    }

    const db = await getDb()

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
      await db.calendar.updateGoogleSyncToken({
        googleCalendarId: calendar.google_calendar_id,
        syncToken: fullResult.sync_token,
      })
    }
  }

  const syncCalendar = useCallback(async (calendar: Calendar, token: string) => {
    const db = await getDb()

    logger.info(`Syncing calendar: ${calendar.name}`, {
      hasToken: !!calendar.sync_token,
    })

    if (!calendar.google_calendar_id) {
      throw new Error("Calendar does not have a Google Calendar ID")
    }

    const result = await rpc.sync_google_events(
      token,
      calendar.google_calendar_id,
      calendar.id,
      calendar.sync_token,
    )

    // Handle 410 Gone - need full re-sync
    if (result.full_sync_required) {
      await doFullSync({
        token,
        calendar,
      })
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
      await db.calendar.updateGoogleSyncToken({
        googleCalendarId: calendar.google_calendar_id,
        syncToken: result.sync_token,
      })
    }

    logger.info(`Sync complete for ${calendar.name}`)
  }, [])

  const onSync = useEffectEvent(async () => {
    if (isSyncingRef.current) {
      return
    }

    if (selectedCalendars.length === 0) {
      return
    }

    isSyncingRef.current = true

    try {
      logger.info(`Starting sync for ${selectedCalendars.length} calendars...`)

      for (const calendar of selectedCalendars) {
        await withAuthRetry((token) => syncCalendar(calendar, token))
      }

      logger.info("All calendars synced successfully")
      options?.onSyncComplete?.()
    } catch (error) {
      logger.error("Sync failed:", error)
    } finally {
      isSyncingRef.current = false
    }
  })

  // Sync once on mount
  useEffect(() => {
    void onSync()
  }, [])

  // Manual sync trigger
  const triggerSync = useCallback(() => {
    void onSync()
  }, [onSync])

  return { triggerSync, isSyncing: isSyncingRef.current }
}
