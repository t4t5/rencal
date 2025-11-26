import Database from "@tauri-apps/plugin-sql"
import { v4 as uuidv4 } from "uuid"
import { z } from "zod"

import { sqliteBool, sqliteDate } from "@/lib/sqlite-schema"

const calendarEventSchema = z.object({
  id: z.string(),
  provider_event_id: z.string().nullable(),
  calendar_id: z.string(),
  summary: z.string().nullable(),
  start: sqliteDate,
  end: sqliteDate,
  all_day: sqliteBool,
  updated_at: sqliteDate,
})

export type CalendarEvent = z.output<typeof calendarEventSchema>
export type CalendarEventInsertData = Omit<CalendarEvent, "id" | "updated_at">

export const calendarEventStorage = (db: Database) => ({
  /**
   * Upsert an event - insert or update based on provider_event_id
   */
  async upsert(event: CalendarEventInsertData) {
    // Check if event with this provider_event_id already exists
    if (event.provider_event_id) {
      const existing = await db.select<unknown[]>(
        "SELECT id FROM events WHERE provider_event_id = $1 AND calendar_id = $2",
        [event.provider_event_id, event.calendar_id],
      )

      if (existing.length > 0) {
        // Update existing event
        await db.execute(
          `UPDATE events SET
            summary = $1,
            start = $2,
            end = $3,
            all_day = $4,
            updated_at = $5
          WHERE provider_event_id = $6 AND calendar_id = $7`,
          [
            event.summary,
            event.start.toISOString(),
            event.end.toISOString(),
            event.all_day ? 1 : 0,
            new Date().toISOString(),
            event.provider_event_id,
            event.calendar_id,
          ],
        )
        return
      }
    }

    // Insert new event
    await db.execute(
      `INSERT INTO events
        (id, provider_event_id, calendar_id, summary, start, end, all_day, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        uuidv4(),
        event.provider_event_id,
        event.calendar_id,
        event.summary,
        event.start.toISOString(),
        event.end.toISOString(),
        event.all_day ? 1 : 0,
        new Date().toISOString(),
      ],
    )
  },

  async upsertMany(events: CalendarEvent[]) {
    for (const event of events) {
      await this.upsert(event)
    }
  },

  async deleteByProviderEventIds(providerEventIds: string[], calendarId: string) {
    if (providerEventIds.length === 0) return

    const placeholders = providerEventIds.map((_, i) => `$${i + 1}`).join(", ")
    await db.execute(
      `DELETE FROM events WHERE provider_event_id IN (${placeholders}) AND calendar_id = $${providerEventIds.length + 1}`,
      [...providerEventIds, calendarId],
    )
  },

  async deleteByCalendarId(calendarId: string) {
    await db.execute("DELETE FROM events WHERE calendar_id = $1", [calendarId])
  },

  async getByDateRange(
    calendarIds: string[],
    startDate: string,
    endDate: string,
  ): Promise<CalendarEvent[]> {
    if (calendarIds.length === 0) return []

    const placeholders = calendarIds.map((_, i) => `$${i + 1}`).join(", ")
    const rows = await db.select<unknown[]>(
      `SELECT * FROM events
        WHERE calendar_id IN (${placeholders})
        AND start >= $${calendarIds.length + 1}
        AND start <= $${calendarIds.length + 2}
        ORDER BY start ASC`,
      [...calendarIds, startDate, endDate],
    )

    return rows.map((row) => calendarEventSchema.parse(row))
  },

  async getByCalendarIds(calendarIds: string[]): Promise<CalendarEvent[]> {
    if (calendarIds.length === 0) return []

    const placeholders = calendarIds.map((_, i) => `$${i + 1}`).join(", ")
    const rows = await db.select<unknown[]>(
      `SELECT * FROM events
        WHERE calendar_id IN (${placeholders})
        ORDER BY start ASC`,
      calendarIds,
    )

    return rows.map((row) => calendarEventSchema.parse(row))
  },
})
