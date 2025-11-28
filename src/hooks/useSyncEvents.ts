import { and, eq, inArray } from "drizzle-orm"
import { useCallback, useEffect, useEffectEvent, useState } from "react"
import { v4 as uuidv4 } from "uuid"

import { useAuth } from "@/contexts/AuthContext"
import { useCalendarState } from "@/contexts/CalendarStateContext"

import { logger } from "@/lib/logger"
import { GoogleEvent, syncGoogleEvents } from "@/lib/providers/google/calendar"

import { db, schema } from "@/db/database"
import type { Account, Calendar, CalendarEventInsert, ReminderInsert } from "@/db/types"

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
    location: googleEvent.location ?? null,
    status: googleEvent.status,
    organizerEmail: googleEvent.organizer?.self ? null : (googleEvent.organizer?.email ?? null),
  }
}

function googleEventToReminders(googleEvent: GoogleEvent): number[] {
  if (!googleEvent.reminders || googleEvent.reminders.useDefault) {
    return []
  }
  return googleEvent.reminders.overrides?.map((r) => r.minutes) ?? []
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
  const { calendars } = useCalendarState()

  const [isSyncing, setIsSyncing] = useState(false)

  const visibleCalendars = calendars.filter((c) => c.isVisible && c.providerCalendarId)

  const getAccountForCalendar = useCallback(
    (calendar: Calendar): Account | undefined => {
      return accounts.find((a) => a.id === calendar.accountId)
    },
    [accounts],
  )

  const upsertEvent = async (event: CalendarEventInsert): Promise<string> => {
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
            location: event.location,
            status: event.status,
            organizerEmail: event.organizerEmail,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(schema.events.providerEventId, event.providerEventId),
              eq(schema.events.calendarId, event.calendarId),
            ),
          )
        return existing.id
      }
    }

    const id = uuidv4()
    await db.insert(schema.events).values({
      ...event,
      id,
      updatedAt: new Date(),
    })

    return id
  }

  const syncReminders = async (eventId: string, reminderMinutes: number[]) => {
    // Delete existing reminders for this event
    await db.delete(schema.reminders).where(eq(schema.reminders.eventId, eventId))

    // Insert new reminders
    if (reminderMinutes.length > 0) {
      const reminders: ReminderInsert[] = reminderMinutes.map((minutes) => ({
        eventId,
        minutes,
      }))
      await db.insert(schema.reminders).values(reminders)
    }
  }

  const upsertEventWithReminders = async (
    googleEvent: GoogleEvent,
    calendarId: string,
  ): Promise<void> => {
    const event = googleEventToCalendarEvent(googleEvent, calendarId)
    if (!event) return

    const eventId = await upsertEvent(event)
    const reminderMinutes = googleEventToReminders(googleEvent)
    await syncReminders(eventId, reminderMinutes)
  }

  const upsertMany = async (googleEvents: GoogleEvent[], calendarId: string) => {
    for (const googleEvent of googleEvents) {
      await upsertEventWithReminders(googleEvent, calendarId)
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

    if (fullResult.events.length > 0) {
      await upsertMany(fullResult.events, calendar.id)
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

      // Upsert events with reminders
      if (result.events.length > 0) {
        logger.debug(`🔁 Upserting ${result.events.length} events to "${calendar.name}"`)
        await upsertMany(result.events, calendar.id)
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

    if (visibleCalendars.length === 0) {
      return
    }

    setIsSyncing(true)

    try {
      for (const calendar of visibleCalendars) {
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
  }, [visibleCalendars.length, accounts.length])

  // Manual sync trigger
  const triggerSync = useCallback(() => {
    void onSync()
  }, [onSync])

  return { triggerSync, isSyncing }
}
