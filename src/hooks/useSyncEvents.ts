import { useCallback, useEffect, useEffectEvent, useRef } from "react"

import { logger } from "@/lib/logger"
import { GoogleEvent, syncGoogleEvents } from "@/lib/providers/google/calendar"

import { useAuth } from "@/contexts/AuthContext"
import { useCalendar } from "@/contexts/CalendarContext"
import { useStorage } from "@/contexts/StorageContext"
import { CalendarEventInsertData } from "@/storage/models/calendarEvent"
import { Account } from "@/types/account"
import { Calendar } from "@/types/calendar"
import { CalendarEvent } from "@/types/calendar-event"

function googleEventToCalendarEvent(
  googleEvent: GoogleEvent,
  calendarId: string,
): CalendarEventInsertData | null {
  const { start: _start, end: _end } = googleEvent

  // Handle all-day events (date) vs timed events (dateTime)
  const start = _start.date ?? _start.dateTime
  const end = _end.date ?? _end.dateTime

  if (!start || !end) {
    return null
  }

  return {
    provider_event_id: googleEvent.id,
    calendar_id: calendarId,
    summary: googleEvent.summary ?? null,
    start,
    end,
    all_day: !!googleEvent.start.date,
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
  const { store } = useStorage()
  const { accounts, withAuthRetry } = useAuth()
  const { calendars } = useCalendar()
  const isSyncingRef = useRef(false)

  const selectedCalendars = calendars.filter((c) => c.selected && c.provider_calendar_id)

  const getAccountForCalendar = useCallback(
    (calendar: Calendar): Account | undefined => {
      return accounts.find((a) => a.id === calendar.account_id)
    },
    [accounts],
  )

  const doFullSync = async (calendar: Calendar, account: Account) => {
    logger.warn(`🔁 Sync token expired for ${calendar.name}, doing full sync...`)

    const { provider_calendar_id } = calendar

    if (!provider_calendar_id) {
      throw new Error("Calendar does not have a provider calendar ID")
    }

    // Retry with no sync token (full sync)
    const fullResult = await withAuthRetry(account, (token) =>
      syncGoogleEvents(token, provider_calendar_id, null),
    )

    // Convert Google events to our Event type
    const events = fullResult.events
      .map((ge) => googleEventToCalendarEvent(ge, calendar.id))
      .filter((e): e is CalendarEvent => e !== null)

    if (events.length > 0) {
      await store.event.upsertMany(events)
    }

    if (fullResult.syncToken) {
      await store.calendar.updateSyncToken({
        providerCalendarId: provider_calendar_id,
        syncToken: fullResult.syncToken,
      })
    }
  }

  const syncCalendar = useCallback(
    async (calendar: Calendar, account: Account) => {
      logger.debug(`🔁 Syncing calendar "${calendar.name}"...`, {
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
        logger.debug(`🔁 Deleting ${result.deletedEventIds.length} events from "${calendar.name}"`)
        await store.event.deleteByProviderEventIds(result.deletedEventIds, calendar.id)
      }

      // Convert Google events to our Event type and upsert
      const events = result.events
        .map((ge) => googleEventToCalendarEvent(ge, calendar.id))
        .filter((e): e is CalendarEvent => e !== null)

      if (events.length > 0) {
        logger.debug(`🔁 Upserting ${events.length} events to "${calendar.name}"`)
        await store.event.upsertMany(events)
      }

      // Update sync token
      if (result.syncToken) {
        await store.calendar.updateSyncToken({
          providerCalendarId: provider_calendar_id,
          syncToken: result.syncToken,
        })
      }

      logger.debug(`🔁 Sync complete for "${calendar.name}"`)
    },
    [doFullSync, withAuthRetry, store],
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
      for (const calendar of selectedCalendars) {
        const account = getAccountForCalendar(calendar)

        if (!account) {
          logger.warn(`No account found for calendar ${calendar.name}, skipping sync`)
          continue
        }

        await syncCalendar(calendar, account)
      }

      options?.onSyncComplete?.()
    } catch (error) {
      logger.error("🔁 Sync failed:", error)
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
