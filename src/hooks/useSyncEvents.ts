import { and, eq, inArray } from "drizzle-orm"
import { useCallback, useEffect, useEffectEvent, useRef } from "react"

import { logger } from "@/lib/logger"
import { GoogleEvent, syncGoogleEvents } from "@/lib/providers/google/calendar"

import { useAuth } from "@/contexts/AuthContext"
import { useCalendar } from "@/contexts/CalendarContext"
import { Account, Calendar, CalendarEventInsert, calendars, db, events } from "@/db/database"

function googleEventToCalendarEvent(
  googleEvent: GoogleEvent,
  calendarId: string,
): CalendarEventInsert | null {
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
    start: new Date(start),
    end: new Date(end),
    all_day: !!googleEvent.start.date,
  }
}

/**
 * Hook that handles syncing events from Google Calendar to local SQLite.
 * - Syncs on mount and when auth/calendars change
 * - Periodically syncs every 30 seconds
 * - Uses incremental sync when possible (sync tokens)
 * - Falls back to full sync when sync token expires
 */
export const useSyncEvents = (options?: { onSyncComplete?: () => void }) => {
  const { accounts, withAuthRetry } = useAuth()
  const { calendars: calendarList } = useCalendar()
  const isSyncingRef = useRef(false)

  const selectedCalendars = calendarList.filter((c) => c.selected && c.provider_calendar_id)

  const getAccountForCalendar = useCallback(
    (calendar: Calendar): Account | undefined => {
      return accounts.find((a) => a.id === calendar.account_id)
    },
    [accounts],
  )

  const upsertEvent = async (event: CalendarEventInsert) => {
    if (event.provider_event_id) {
      const [existing] = await db
        .select({ id: events.id })
        .from(events)
        .where(
          and(
            eq(events.provider_event_id, event.provider_event_id),
            eq(events.calendar_id, event.calendar_id),
          ),
        )

      if (existing) {
        await db
          .update(events)
          .set({
            summary: event.summary,
            start: event.start,
            end: event.end,
            all_day: event.all_day,
            updated_at: new Date(),
          })
          .where(
            and(
              eq(events.provider_event_id, event.provider_event_id),
              eq(events.calendar_id, event.calendar_id),
            ),
          )
        return
      }
    }

    await db.insert(events).values({
      ...event,
      updated_at: new Date(),
    })
  }

  const upsertMany = async (eventsToUpsert: CalendarEventInsert[]) => {
    for (const event of eventsToUpsert) {
      await upsertEvent(event)
    }
  }

  const deleteByProviderEventIds = async (providerEventIds: string[], calendarId: string) => {
    if (providerEventIds.length === 0) return

    await db
      .delete(events)
      .where(
        and(
          inArray(events.provider_event_id, providerEventIds),
          eq(events.calendar_id, calendarId),
        ),
      )
  }

  const updateSyncToken = async (providerCalendarId: string, syncToken: string) => {
    await db
      .update(calendars)
      .set({ sync_token: syncToken, last_synced_at: new Date() })
      .where(eq(calendars.provider_calendar_id, providerCalendarId))
  }

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
    const syncedEvents = fullResult.events
      .map((ge) => googleEventToCalendarEvent(ge, calendar.id))
      .filter((e): e is CalendarEventInsert => e !== null)

    if (syncedEvents.length > 0) {
      await upsertMany(syncedEvents)
    }

    if (fullResult.syncToken) {
      await updateSyncToken(provider_calendar_id, fullResult.syncToken)
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
        await deleteByProviderEventIds(result.deletedEventIds, calendar.id)
      }

      // Convert Google events to our Event type and upsert
      const syncedEvents = result.events
        .map((ge) => googleEventToCalendarEvent(ge, calendar.id))
        .filter((e): e is CalendarEventInsert => e !== null)

      if (syncedEvents.length > 0) {
        logger.debug(`🔁 Upserting ${syncedEvents.length} events to "${calendar.name}"`)
        await upsertMany(syncedEvents)
      }

      // Update sync token
      if (result.syncToken) {
        await updateSyncToken(provider_calendar_id, result.syncToken)
      }

      logger.debug(`🔁 Sync complete for "${calendar.name}"`)
    },
    [doFullSync, withAuthRetry, db],
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
