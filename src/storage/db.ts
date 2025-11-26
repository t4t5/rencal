import { and, eq, gte, inArray, lte } from "drizzle-orm"
import type { InferInsertModel, InferSelectModel } from "drizzle-orm"
import { v4 as uuidv4 } from "uuid"

import { db } from "@/db/database"
import { accounts, calendars, events } from "@/db/schema"

// Export types from schema
export type Account = InferSelectModel<typeof accounts>
export type AccountInsertData = Omit<InferInsertModel<typeof accounts>, "id" | "created_at">

export type Calendar = InferSelectModel<typeof calendars>
export type CalendarInsertData = Omit<InferInsertModel<typeof calendars>, "id">

// CalendarEvent from DB has start/end as strings
type CalendarEventRow = InferSelectModel<typeof events>

// CalendarEvent for use in the app has start/end as Dates
export type CalendarEvent = Omit<CalendarEventRow, "start" | "end"> & {
  start: Date
  end: Date
}

// Insert data accepts Dates for start/end
export type CalendarEventInsertData = Omit<
  InferInsertModel<typeof events>,
  "id" | "updated_at" | "start" | "end"
> & {
  start: Date
  end: Date
}

function rowToCalendarEvent(row: CalendarEventRow): CalendarEvent {
  return {
    ...row,
    start: new Date(row.start),
    end: new Date(row.end),
  }
}

// Account storage
const accountStorage = {
  async getAll(): Promise<Account[]> {
    return db.select().from(accounts)
  },

  async getById(id: string): Promise<Account | undefined> {
    const [row] = await db.select().from(accounts).where(eq(accounts.id, id))
    return row
  },

  async insert(account: AccountInsertData) {
    await db.insert(accounts).values({
      id: uuidv4(),
      ...account,
      created_at: new Date(),
    })
  },

  async update(account: Account) {
    const { id, ...data } = account
    await db.update(accounts).set(data).where(eq(accounts.id, id))
  },

  async delete(id: string) {
    await db.delete(accounts).where(eq(accounts.id, id))
  },
}

// Calendar storage
const calendarStorage = {
  async list(): Promise<Calendar[]> {
    return db.select().from(calendars)
  },

  async listActive(): Promise<Calendar[]> {
    return db.select().from(calendars).where(eq(calendars.selected, true))
  },

  async findByProviderCalendarId(providerCalendarId: string): Promise<Calendar | null> {
    const [row] = await db
      .select()
      .from(calendars)
      .where(eq(calendars.provider_calendar_id, providerCalendarId))
    return row ?? null
  },

  async updateSyncToken({
    providerCalendarId,
    syncToken,
  }: {
    providerCalendarId: string
    syncToken: string
  }) {
    await db
      .update(calendars)
      .set({ sync_token: syncToken, last_synced_at: new Date() })
      .where(eq(calendars.provider_calendar_id, providerCalendarId))
  },

  async add(calendar: CalendarInsertData) {
    await db
      .insert(calendars)
      .values({
        id: uuidv4(),
        ...calendar,
      })
      .onConflictDoUpdate({
        target: [calendars.account_id, calendars.provider_calendar_id],
        set: {
          name: calendar.name,
          color: calendar.color,
        },
      })
  },
}

// Event storage
const calendarEventStorage = {
  async upsert(event: CalendarEventInsertData) {
    const startStr = event.start.toISOString()
    const endStr = event.end.toISOString()

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
            start: startStr,
            end: endStr,
            all_day: event.all_day,
            updated_at: new Date().toISOString(),
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
      id: uuidv4(),
      provider_event_id: event.provider_event_id,
      calendar_id: event.calendar_id,
      summary: event.summary,
      start: startStr,
      end: endStr,
      all_day: event.all_day,
      updated_at: new Date().toISOString(),
    })
  },

  async upsertMany(eventsToUpsert: CalendarEventInsertData[]) {
    for (const event of eventsToUpsert) {
      await this.upsert(event)
    }
  },

  async deleteByProviderEventIds(providerEventIds: string[], calendarId: string) {
    if (providerEventIds.length === 0) return

    await db
      .delete(events)
      .where(
        and(
          inArray(events.provider_event_id, providerEventIds),
          eq(events.calendar_id, calendarId),
        ),
      )
  },

  async deleteByCalendarId(calendarId: string) {
    await db.delete(events).where(eq(events.calendar_id, calendarId))
  },

  async getByDateRange(
    calendarIds: string[],
    startDate: string,
    endDate: string,
  ): Promise<CalendarEvent[]> {
    if (calendarIds.length === 0) return []

    const rows = await db
      .select()
      .from(events)
      .where(
        and(
          inArray(events.calendar_id, calendarIds),
          gte(events.start, startDate),
          lte(events.start, endDate),
        ),
      )
      .orderBy(events.start)

    return rows.map(rowToCalendarEvent)
  },

  async getByCalendarIds(calendarIds: string[]): Promise<CalendarEvent[]> {
    if (calendarIds.length === 0) return []

    const rows = await db
      .select()
      .from(events)
      .where(inArray(events.calendar_id, calendarIds))
      .orderBy(events.start)

    return rows.map(rowToCalendarEvent)
  },
}

// Storage class that provides the same interface as before
export class Storage {
  account = accountStorage
  calendar = calendarStorage
  event = calendarEventStorage
}

export const getDb = async () => {
  // The db is already initialized via the proxy, just return the Storage instance
  return new Storage()
}
