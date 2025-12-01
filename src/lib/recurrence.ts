import { addYears } from "date-fns"
import { eq } from "drizzle-orm"
import { rrulestr } from "rrule"
import { v4 as uuidv4 } from "uuid"

import { db, schema } from "@/db/database"
import type { CalendarEventInsert } from "@/db/types"

/**
 * Generate instances from a recurring event's RRULE
 */
export function generateInstances(
  parentEvent: {
    id: string
    calendarId: string
    summary: string | null
    start: Date
    end: Date
    allDay: boolean
    location: string | null
    recurrence: string
    status: "confirmed" | "tentative" | "cancelled" | null
    organizerEmail: string | null
  },
  existingExceptionDates: Date[] = [],
): CalendarEventInsert[] {
  const rruleSet = rrulestr(parentEvent.recurrence, {
    forceset: true,
    dtstart: parentEvent.start,
  })
  const horizon = addYears(new Date(), 1)

  // Get all occurrence dates within the horizon
  const dates = rruleSet.between(parentEvent.start, horizon, true)

  // Get set of exception dates to skip
  const exceptionDateTimes = new Set(existingExceptionDates.map((d) => d.getTime()))

  // Calculate duration of the event
  const durationMs = parentEvent.end.getTime() - parentEvent.start.getTime()

  return dates
    .filter((date) => !exceptionDateTimes.has(date.getTime()))
    .map((date) => ({
      calendarId: parentEvent.calendarId,
      providerEventId: null,
      summary: parentEvent.summary,
      start: date,
      end: new Date(date.getTime() + durationMs),
      allDay: parentEvent.allDay,
      location: parentEvent.location,
      recurrence: null,
      recurringEventId: parentEvent.id,
      originalStart: date,
      status: parentEvent.status,
      organizerEmail: parentEvent.organizerEmail,
    }))
}

/**
 * Expand a recurring parent event into instances in the database
 * Preserves existing exceptions (instances with modified data)
 */
export async function expandRecurringEventInstances(parentEventId: string): Promise<void> {
  // Fetch the parent event
  const [parentEvent] = await db
    .select()
    .from(schema.events)
    .where(eq(schema.events.id, parentEventId))

  if (!parentEvent || !parentEvent.recurrence) return

  // Fetch existing instances
  const existingInstances = await db
    .select()
    .from(schema.events)
    .where(eq(schema.events.recurringEventId, parentEventId))

  // Find exceptions: instances where start differs from originalStart (they were modified)
  const exceptions = existingInstances.filter(
    (e) => e.originalStart && e.start.getTime() !== e.originalStart.getTime(),
  )
  const exceptionDates = exceptions.map((e) => e.originalStart!).filter(Boolean)

  // Delete all non-exception instances
  const nonExceptionIds = existingInstances
    .filter((e) => !e.originalStart || e.start.getTime() === e.originalStart.getTime())
    .map((e) => e.id)

  if (nonExceptionIds.length > 0) {
    for (const id of nonExceptionIds) {
      await db.delete(schema.events).where(eq(schema.events.id, id))
    }
  }

  // Generate and insert new instances
  const instances = generateInstances(
    {
      id: parentEvent.id,
      calendarId: parentEvent.calendarId,
      summary: parentEvent.summary,
      start: parentEvent.start,
      end: parentEvent.end,
      allDay: parentEvent.allDay,
      location: parentEvent.location,
      recurrence: parentEvent.recurrence,
      status: parentEvent.status,
      organizerEmail: parentEvent.organizerEmail,
    },
    exceptionDates,
  )

  for (const instance of instances) {
    await db.insert(schema.events).values({
      ...instance,
      id: uuidv4(),
      updatedAt: new Date(),
    })
  }
}
