// import { addYears } from "date-fns"
// import { and, eq, inArray, isNull } from "drizzle-orm"
// import { useCallback, useEffect, useEffectEvent, useState } from "react"
// import { toast } from "sonner"
// import { v4 as uuidv4 } from "uuid"
//
// import { useAuth } from "@/contexts/AuthContext"
// import { useCalendarState } from "@/contexts/CalendarStateContext"
//
// import { logger } from "@/lib/logger"
// import { GoogleEvent, syncGoogleEvents } from "@/lib/providers/google/calendar"
// import { createRRuleWithDtstart } from "@/lib/rrule-utils"
//
// import { db, schema } from "@/db/database"
// import type {
//   Account,
//   Calendar,
//   CalendarEvent,
//   CalendarEventInsert,
//   ReminderInsert,
// } from "@/db/types"
//
// function googleEventToCalendarEvent(
//   googleEvent: GoogleEvent,
//   calendarId: string,
//   recurringEventId: string | null,
// ): CalendarEventInsert | null {
//   const { start: _start, end: _end } = googleEvent
//
//   // Handle all-day events (date) vs timed events (dateTime)
//   const start = _start.date ?? _start.dateTime
//   const end = _end.date ?? _end.dateTime
//
//   if (!start || !end) {
//     return null
//   }
//
//   // Google returns recurrence as an array of RRULE strings, join them
//   const recurrence = googleEvent.recurrence?.join("\n") ?? null
//
//   return {
//     providerEventId: googleEvent.id,
//     calendarId: calendarId,
//     summary: googleEvent.summary ?? null,
//     start: new Date(start),
//     end: new Date(end),
//     allDay: !!googleEvent.start.date,
//     location: googleEvent.location ?? null,
//     recurrence,
//     recurringEventId,
//     status: googleEvent.status,
//     organizerEmail: googleEvent.organizer?.self ? null : (googleEvent.organizer?.email ?? null),
//   }
// }
//
// function googleEventToReminders(googleEvent: GoogleEvent): number[] {
//   if (!googleEvent.reminders || googleEvent.reminders.useDefault) {
//     return []
//   }
//   return googleEvent.reminders.overrides?.map((r) => r.minutes) ?? []
// }
//
// /**
//  * Expand a recurring event into individual instances
//  * @param parentEvent The parent event with recurrence rule
//  * @param existingExceptions Existing exception instances (modified single occurrences) to preserve
//  * @returns Array of instance events to insert
//  */
// function expandRecurringEvent(
//   parentEvent: CalendarEvent,
//   existingExceptions: CalendarEvent[],
// ): CalendarEventInsert[] {
//   if (!parentEvent.recurrence) return []
//
//   const rrule = createRRuleWithDtstart(parentEvent.recurrence, parentEvent.start)
//   const horizon = addYears(new Date(), 1)
//
//   // Get all occurrence dates within the horizon
//   const dates = rrule.between(parentEvent.start, horizon, true)
//
//   // Get set of exception dates (originalStart) to skip
//   const exceptionDates = new Set(
//     existingExceptions.filter((e) => e.originalStart).map((e) => e.originalStart!.getTime()),
//   )
//
//   // Calculate duration of the event
//   const durationMs = parentEvent.end.getTime() - parentEvent.start.getTime()
//
//   return dates
//     .filter((date) => !exceptionDates.has(date.getTime()))
//     .map((date) => ({
//       calendarId: parentEvent.calendarId,
//       providerEventId: null, // Local instances don't have provider IDs
//       summary: parentEvent.summary,
//       start: date,
//       end: new Date(date.getTime() + durationMs),
//       allDay: parentEvent.allDay,
//       location: parentEvent.location,
//       recurrence: null, // Instances don't have recurrence
//       recurringEventId: parentEvent.id,
//       originalStart: date, // Track which occurrence this represents
//       status: parentEvent.status,
//       organizerEmail: parentEvent.organizerEmail,
//     }))
// }
//
// /**
//  * Hook that handles syncing events from Google Calendar to local SQLite.
//  * - Syncs on mount and when auth/calendars change
//  * - Periodically syncs every 30 seconds
//  * - Uses incremental sync when possible (sync tokens)
//  * - Falls back to full sync when sync token expires
//  */
// export const useSyncEvents = (options?: { onSyncComplete?: () => void }) => {
//   const { accounts, withAuthRetry } = useAuth()
//   const { calendars } = useCalendarState()
//
//   const [isSyncing, setIsSyncing] = useState(false)
//   const [syncError, setSyncError] = useState<string | null>(null)
//
//   const visibleCalendars = calendars.filter((c) => c.isVisible && c.providerCalendarId)
//
//   const getAccountForCalendar = useCallback(
//     (calendar: Calendar): Account | undefined => {
//       return accounts.find((a) => a.id === calendar.accountId)
//     },
//     [accounts],
//   )
//
//   const upsertEvent = async (event: CalendarEventInsert): Promise<string> => {
//     if (event.providerEventId) {
//       const [existing] = await db
//         .select({ id: schema.events.id })
//         .from(schema.events)
//         .where(
//           and(
//             eq(schema.events.providerEventId, event.providerEventId),
//             eq(schema.events.calendarId, event.calendarId),
//           ),
//         )
//
//       if (existing) {
//         await db
//           .update(schema.events)
//           .set({
//             summary: event.summary,
//             start: event.start,
//             end: event.end,
//             allDay: event.allDay,
//             location: event.location,
//             recurrence: event.recurrence,
//             recurringEventId: event.recurringEventId,
//             status: event.status,
//             organizerEmail: event.organizerEmail,
//             updatedAt: new Date(),
//           })
//           .where(
//             and(
//               eq(schema.events.providerEventId, event.providerEventId),
//               eq(schema.events.calendarId, event.calendarId),
//             ),
//           )
//         return existing.id
//       }
//     }
//
//     const id = uuidv4()
//     await db.insert(schema.events).values({
//       ...event,
//       id,
//       recurringEventId: event.recurringEventId || null,
//       updatedAt: new Date(),
//     })
//
//     return id
//   }
//
//   const syncReminders = async (eventId: string, reminderMinutes: number[]) => {
//     // Delete existing reminders for this event
//     await db.delete(schema.reminders).where(eq(schema.reminders.eventId, eventId))
//
//     // Insert new reminders
//     if (reminderMinutes.length > 0) {
//       const reminders: ReminderInsert[] = reminderMinutes.map((minutes) => ({
//         eventId,
//         minutes,
//       }))
//       await db.insert(schema.reminders).values(reminders)
//     }
//   }
//
//   /**
//    * Expand a recurring parent event into instances
//    * Preserves existing exceptions (instances with modified data)
//    */
//   const expandAndInsertInstances = async (parentEventId: string) => {
//     // Fetch the parent event
//     const [parentEvent] = await db
//       .select()
//       .from(schema.events)
//       .where(eq(schema.events.id, parentEventId))
//
//     if (!parentEvent || !parentEvent.recurrence) return
//
//     // Fetch existing exceptions (instances that have been modified - they have originalStart set and different data)
//     const existingExceptions = await db
//       .select()
//       .from(schema.events)
//       .where(
//         and(
//           eq(schema.events.recurringEventId, parentEventId),
//           // Exceptions are instances where start differs from originalStart (they were moved)
//           // For now, we'll preserve all existing instances that have originalStart set
//         ),
//       )
//
//     // Find exceptions: instances that were modified (we detect by checking if they have originalStart)
//     const exceptions = existingExceptions.filter((e) => e.originalStart !== null)
//
//     // Delete non-exception instances (they'll be regenerated)
//     await db
//       .delete(schema.events)
//       .where(
//         and(eq(schema.events.recurringEventId, parentEventId), isNull(schema.events.originalStart)),
//       )
//
//     // Also delete instances that aren't exceptions (originalStart equals start)
//     const nonExceptionIds = existingExceptions
//       .filter((e) => e.originalStart && e.originalStart.getTime() === e.start.getTime())
//       .map((e) => e.id)
//
//     if (nonExceptionIds.length > 0) {
//       await db.delete(schema.events).where(inArray(schema.events.id, nonExceptionIds))
//     }
//
//     // Generate new instances
//     const instances = expandRecurringEvent(parentEvent, exceptions)
//
//     if (instances.length > 0) {
//       logger.debug(`🔁 Expanding ${instances.length} instances for recurring event`)
//       for (const instance of instances) {
//         await db.insert(schema.events).values({
//           ...instance,
//           id: uuidv4(),
//           updatedAt: new Date(),
//         })
//       }
//     }
//   }
//
//   const lookupRecurringEventId = async (
//     providerRecurringEventId: string | undefined,
//     calendarId: string,
//   ): Promise<string | null> => {
//     if (!providerRecurringEventId) return null
//
//     // Look up our internal ID for the parent recurring event
//     const [parent] = await db
//       .select({ id: schema.events.id })
//       .from(schema.events)
//       .where(
//         and(
//           eq(schema.events.providerEventId, providerRecurringEventId),
//           eq(schema.events.calendarId, calendarId),
//         ),
//       )
//
//     return parent?.id ?? null
//   }
//
//   const upsertEventWithReminders = async (
//     googleEvent: GoogleEvent,
//     calendarId: string,
//   ): Promise<void> => {
//     const recurringEventId = await lookupRecurringEventId(googleEvent.recurringEventId, calendarId)
//
//     // Skip instances whose parent recurring event isn't in our DB
//     // (e.g., parent is outside our sync window or from a special calendar)
//     if (googleEvent.recurringEventId && !recurringEventId) {
//       logger.debug(`Skipping orphaned instance ${googleEvent.id} - parent not found`)
//       return
//     }
//
//     const event = googleEventToCalendarEvent(googleEvent, calendarId, recurringEventId)
//     if (!event) return
//
//     const eventId = await upsertEvent(event)
//     const reminderMinutes = googleEventToReminders(googleEvent)
//     await syncReminders(eventId, reminderMinutes)
//
//     // If this is a parent recurring event, expand it into instances
//     if (event.recurrence && !event.recurringEventId) {
//       logger.debug(`Expanding recurring event: "${event.summary}"`, {
//         recurrence: event.recurrence,
//         start: event.start.toISOString(),
//       })
//       await expandAndInsertInstances(eventId)
//     }
//   }
//
//   const upsertMany = async (googleEvents: GoogleEvent[], calendarId: string) => {
//     // Sort events so parent recurring events come before their instances
//     // Parent events have recurrence but no recurringEventId
//     // Instances have recurringEventId but no recurrence
//     const sorted = [...googleEvents].sort((a, b) => {
//       const aIsParent = a.recurrence && !a.recurringEventId
//       const bIsParent = b.recurrence && !b.recurringEventId
//       if (aIsParent && !bIsParent) return -1
//       if (!aIsParent && bIsParent) return 1
//       return 0
//     })
//
//     for (const googleEvent of sorted) {
//       await upsertEventWithReminders(googleEvent, calendarId)
//     }
//   }
//
//   const deleteByProviderEventIds = async (providerEventIds: string[], calendarId: string) => {
//     if (providerEventIds.length === 0) return
//
//     await db
//       .delete(schema.events)
//       .where(
//         and(
//           inArray(schema.events.providerEventId, providerEventIds),
//           eq(schema.events.calendarId, calendarId),
//         ),
//       )
//   }
//
//   const updateSyncToken = async (providerCalendarId: string, syncToken: string) => {
//     await db
//       .update(schema.calendars)
//       .set({ syncToken: syncToken, lastSyncedAt: new Date() })
//       .where(eq(schema.calendars.providerCalendarId, providerCalendarId))
//   }
//
//   const doFullSync = async (calendar: Calendar, account: Account) => {
//     logger.warn(`🔁 Sync token expired for ${calendar.name}, doing full sync...`)
//
//     const { providerCalendarId } = calendar
//
//     if (!providerCalendarId) {
//       throw new Error("Calendar does not have a provider calendar ID")
//     }
//
//     // Retry with no sync token (full sync)
//     const fullResult = await withAuthRetry(account, (token) =>
//       syncGoogleEvents(token, providerCalendarId, null),
//     )
//
//     if (fullResult.events.length > 0) {
//       await upsertMany(fullResult.events, calendar.id)
//     }
//
//     if (fullResult.syncToken) {
//       await updateSyncToken(providerCalendarId, fullResult.syncToken)
//     }
//   }
//
//   const syncCalendar = useCallback(
//     async (calendar: Calendar, account: Account) => {
//       logger.debug(`🔁 Syncing calendar "${calendar.name}"...`, {
//         hasToken: !!calendar.syncToken,
//       })
//
//       const { providerCalendarId, syncToken } = calendar
//
//       if (!providerCalendarId) {
//         throw new Error("Calendar does not have a provider calendar ID")
//       }
//
//       const result = await withAuthRetry(account, (token) =>
//         syncGoogleEvents(token, providerCalendarId, syncToken),
//       )
//
//       // Handle 410 Gone - need full re-sync
//       if (result.fullSyncRequired) {
//         await doFullSync(calendar, account)
//         return
//       }
//
//       // Handle deleted events
//       if (result.deletedEventIds.length > 0) {
//         logger.debug(`🔁 Deleting ${result.deletedEventIds.length} events from "${calendar.name}"`)
//         await deleteByProviderEventIds(result.deletedEventIds, calendar.id)
//       }
//
//       // Upsert events with reminders
//       if (result.events.length > 0) {
//         logger.debug(`🔁 Upserting ${result.events.length} events to "${calendar.name}"`)
//         await upsertMany(result.events, calendar.id)
//       }
//
//       // Update sync token
//       if (result.syncToken) {
//         await updateSyncToken(providerCalendarId, result.syncToken)
//       }
//
//       logger.debug(`🔁 Sync complete for "${calendar.name}"`)
//     },
//     [doFullSync, withAuthRetry, db],
//   )
//
//   const onSync = useEffectEvent(async () => {
//     if (isSyncing) {
//       return
//     }
//
//     if (visibleCalendars.length === 0) {
//       return
//     }
//
//     setIsSyncing(true)
//
//     try {
//       for (const calendar of visibleCalendars) {
//         const account = getAccountForCalendar(calendar)
//
//         if (!account) {
//           logger.warn(`No account found for calendar ${calendar.name}, skipping sync`)
//           continue
//         }
//
//         await syncCalendar(calendar, account)
//       }
//
//       setSyncError(null)
//       options?.onSyncComplete?.()
//     } catch (error) {
//       logger.error("🔁 Sync failed:", error)
//       const errorMessage =
//         error instanceof Error ? error.message : "Failed to sync with Google Calendar"
//       setSyncError(errorMessage)
//       toast.error("Sync failed", {
//         description: errorMessage,
//       })
//     } finally {
//       setIsSyncing(false)
//     }
//   })
//
//   // Sync when calendars or accounts change
//   useEffect(() => {
//     void onSync()
//   }, [visibleCalendars.length, accounts.length])
//
//   // Manual sync trigger
//   const triggerSync = useCallback(() => {
//     void onSync()
//   }, [onSync])
//
//   return { triggerSync, isSyncing, syncError }
// }
