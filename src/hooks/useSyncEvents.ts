import { useCallback, useEffect, useEffectEvent, useRef } from "react"

import { logger } from "@/lib/logger"
import { GoogleEvent, syncGoogleEvents } from "@/lib/providers/google/calendar"

import { useAuth } from "@/contexts/AuthContext"
import { useCalendar } from "@/contexts/CalendarContext"
import { getDb } from "@/db/connection"
import { Account } from "@/types/account"
import { Calendar } from "@/types/calendar"
import { Event } from "@/types/event"

/** Convert Google Calendar event to our Event type */
function googleEventToEvent(googleEvent: GoogleEvent, calendarId: string): Event | null {
  // Handle all-day events (date) vs timed events (dateTime)
  const start = googleEvent.start.date ?? googleEvent.start.dateTime
  const end = googleEvent.end.date ?? googleEvent.end.dateTime

  if (!start || !end) {
    return null
  }

  return {
    id: crypto.randomUUID(),
    provider_event_id: googleEvent.id,
    calendar_id: calendarId,
    summary: googleEvent.summary ?? "(No title)",
    start,
    end,
    all_day: !!googleEvent.start.date,
    updated_at: googleEvent.updated ?? null,
  }
}

// const SYNC_INTERVAL_MS = 60_000 // 60s

/**
 * Hook that handles syncing events from Google Calendar to local SQLite.
 * - Syncs on mount and when auth/calendars change
 * - Periodically syncs every 30 seconds
 * - Uses incremental sync when possible (sync tokens)
 * - Falls back to full sync when sync token expires
 */
export const useSyncEvents = (options?: { onSyncComplete?: () => void }) => {
  const { accounts, withAuthRetry } = useAuth()
  const { calendars } = useCalendar()
  const isSyncingRef = useRef(false)

  const selectedCalendars = calendars.filter((c) => c.selected && c.provider_calendar_id)

  // Get the account for a calendar
  const getAccountForCalendar = useCallback(
    (calendar: Calendar): Account | undefined => {
      return accounts.find((a) => a.id === calendar.account_id)
    },
    [accounts],
  )

  const doFullSync = async (calendar: Calendar, account: Account) => {
    logger.warn(`Sync token expired for ${calendar.name}, doing full sync...`)

    const { provider_calendar_id } = calendar

    if (!provider_calendar_id) {
      throw new Error("Calendar does not have a provider calendar ID")
    }

    const db = await getDb()

    // Retry with no sync token (full sync)
    const fullResult = await withAuthRetry(account, (token) =>
      syncGoogleEvents(token, provider_calendar_id, null),
    )

    // Convert Google events to our Event type
    const events = fullResult.events
      .map((ge) => googleEventToEvent(ge, calendar.id))
      .filter((e): e is Event => e !== null)

    if (events.length > 0) {
      await db.event.upsertMany(events)
    }

    if (fullResult.syncToken) {
      await db.calendar.updateSyncToken({
        providerCalendarId: provider_calendar_id,
        syncToken: fullResult.syncToken,
      })
    }
  }

  const syncCalendar = useCallback(
    async (calendar: Calendar, account: Account) => {
      const db = await getDb()

      logger.info(`Syncing calendar: ${calendar.name}`, {
        hasToken: !!calendar.sync_token,
      })

      const { provider_calendar_id, sync_token } = calendar

      if (!provider_calendar_id) {
        throw new Error("Calendar does not have a provider calendar ID")
      }

      const result = await withAuthRetry(account, (token) =>
        syncGoogleEvents(token, provider_calendar_id, sync_token),
      )

      // Handle 410 Gone - need full re-sync
      if (result.fullSyncRequired) {
        await doFullSync(calendar, account)
        return
      }

      // Handle deleted events
      if (result.deletedEventIds.length > 0) {
        logger.info(`Deleting ${result.deletedEventIds.length} events from ${calendar.name}`)
        await db.event.deleteByProviderEventIds(result.deletedEventIds, calendar.id)
      }

      // Convert Google events to our Event type and upsert
      const events = result.events
        .map((ge) => googleEventToEvent(ge, calendar.id))
        .filter((e): e is Event => e !== null)

      if (events.length > 0) {
        logger.info(`Upserting ${events.length} events to ${calendar.name}`)
        await db.event.upsertMany(events)
      }

      // Update sync token
      if (result.syncToken) {
        await db.calendar.updateSyncToken({
          providerCalendarId: provider_calendar_id,
          syncToken: result.syncToken,
        })
      }

      logger.info(`Sync complete for ${calendar.name}`)
    },
    [doFullSync, withAuthRetry],
  )

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
        const account = getAccountForCalendar(calendar)
        if (!account) {
          logger.warn(`No account found for calendar ${calendar.name}, skipping sync`)
          continue
        }

        await syncCalendar(calendar, account)
      }

      logger.info("All calendars synced successfully")
      options?.onSyncComplete?.()
    } catch (error) {
      logger.error("Sync failed:", error)
    } finally {
      isSyncingRef.current = false
    }
  })

  // Sync when calendars or accounts change
  useEffect(() => {
    void onSync()
  }, [selectedCalendars.length, accounts.length])

  // Manual sync trigger
  const triggerSync = useCallback(() => {
    void onSync()
  }, [onSync])

  return { triggerSync, isSyncing: isSyncingRef.current }
}
