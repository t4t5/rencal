import { and, eq, inArray } from "drizzle-orm"
import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react"

import { useAuth } from "@/contexts/AuthContext"
import { useCalendar } from "@/contexts/CalendarContext"

import { logger } from "@/lib/logger"
import { GoogleEvent, syncGoogleEvents } from "@/lib/providers/google/calendar"

import { db, schema } from "@/db/database"
import type { Account, Calendar, CalendarEventInsert } from "@/db/types"

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
    providerEventId: googleEvent.id,
    calendarId: calendarId,
    summary: googleEvent.summary ?? null,
    start: new Date(start),
    end: new Date(end),
    allDay: !!googleEvent.start.date,
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
  const { calendars } = useCalendar()

  const [isSyncing, setIsSyncing] = useState(false)

  const selectedCalendars = calendars.filter((c) => c.selected && c.providerCalendarId)

  const getAccountForCalendar = useCallback(
    (calendar: Calendar): Account | undefined => {
      return accounts.find((a) => a.id === calendar.accountId)
    },
    [accounts],
  )

  const upsertEvent = async (event: CalendarEventInsert) => {
    if (event.providerEventId) {
      const [existing] = await db
        .select({ id: schema.events.id })
        .from(schema.events)
        .where(
          and(
            eq(schema.events.providerEventId, event.providerEventId),
            eq(schema.events.calendarId, event.calendarId),
          ),
        )

      if (existing) {
        await db
          .update(schema.events)
          .set({
            summary: event.summary,
            start: event.start,
            end: event.end,
            allDay: event.allDay,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(schema.events.providerEventId, event.providerEventId),
              eq(schema.events.calendarId, event.calendarId),
            ),
          )
        return
      }
    }

    await db.insert(schema.events).values({
      ...event,
      updatedAt: new Date(),
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
      .delete(schema.events)
      .where(
        and(
          inArray(schema.events.providerEventId, providerEventIds),
          eq(schema.events.calendarId, calendarId),
        ),
      )
  }

  const updateSyncToken = async (providerCalendarId: string, syncToken: string) => {
    await db
      .update(schema.calendars)
      .set({ syncToken: syncToken, lastSyncedAt: new Date() })
      .where(eq(schema.calendars.providerCalendarId, providerCalendarId))
  }

  const doFullSync = async (calendar: Calendar, account: Account) => {
    logger.warn(`🔁 Sync token expired for ${calendar.name}, doing full sync...`)

    const { providerCalendarId } = calendar

    if (!providerCalendarId) {
      throw new Error("Calendar does not have a provider calendar ID")
    }

    // Retry with no sync token (full sync)
    const fullResult = await withAuthRetry(account, (token) =>
      syncGoogleEvents(token, providerCalendarId, null),
    )

    // Convert Google events to our Event type
    const syncedEvents = fullResult.events
      .map((ge) => googleEventToCalendarEvent(ge, calendar.id))
      .filter((e): e is CalendarEventInsert => e !== null)

    if (syncedEvents.length > 0) {
      await upsertMany(syncedEvents)
    }

    if (fullResult.syncToken) {
      await updateSyncToken(providerCalendarId, fullResult.syncToken)
    }
  }

  const syncCalendar = useCallback(
    async (calendar: Calendar, account: Account) => {
      logger.debug(`🔁 Syncing calendar "${calendar.name}"...`, {
        hasToken: !!calendar.syncToken,
      })

      const { providerCalendarId, syncToken } = calendar

      if (!providerCalendarId) {
        throw new Error("Calendar does not have a provider calendar ID")
      }

      const result = await withAuthRetry(account, (token) =>
        syncGoogleEvents(token, providerCalendarId, syncToken),
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
        await updateSyncToken(providerCalendarId, result.syncToken)
      }

      logger.debug(`🔁 Sync complete for "${calendar.name}"`)
    },
    [doFullSync, withAuthRetry, db],
  )

  const onSync = useEffectEvent(async () => {
    if (isSyncing) {
      return
    }

    if (selectedCalendars.length === 0) {
      return
    }

    setIsSyncing(true)

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
      setIsSyncing(false)
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

  return { triggerSync, isSyncing }
}
