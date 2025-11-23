import Database from "@tauri-apps/plugin-sql"

import { Event } from "@/rpc/bindings"

// Raw DB row type - SQLite returns integers for booleans
type EventRow = {
  id: string
  google_event_id: string | null
  calendar_id: string
  summary: string | null
  start: string
  end: string
  all_day: number
  updated_at: string | null
}

const rowToEvent = (row: EventRow): Event => ({
  id: row.id,
  google_event_id: row.google_event_id,
  calendar_id: row.calendar_id,
  summary: row.summary ?? "(No title)",
  start: row.start,
  end: row.end,
  all_day: row.all_day === 1,
  updated_at: row.updated_at,
})

export const eventController = (db: Database) => ({
  /**
   * Upsert an event - insert or update based on google_event_id
   */
  async upsert(event: Event) {
    // Check if event with this google_event_id already exists
    if (event.google_event_id) {
      const existing = await db.select<EventRow[]>(
        "SELECT id FROM events WHERE google_event_id = $1 AND calendar_id = $2",
        [event.google_event_id, event.calendar_id],
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
          WHERE google_event_id = $6 AND calendar_id = $7`,
          [
            event.summary,
            event.start,
            event.end,
            event.all_day ? 1 : 0,
            event.updated_at,
            event.google_event_id,
            event.calendar_id,
          ],
        )
        return
      }
    }

    // Insert new event
    await db.execute(
      `INSERT INTO events
        (id, google_event_id, calendar_id, summary, start, end, all_day, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        event.id,
        event.google_event_id,
        event.calendar_id,
        event.summary,
        event.start,
        event.end,
        event.all_day ? 1 : 0,
        event.updated_at,
      ],
    )
  },

  /**
   * Upsert multiple events in a batch
   */
  async upsertMany(events: Event[]) {
    for (const event of events) {
      await this.upsert(event)
    }
  },

  /**
   * Delete events by their Google event IDs
   */
  async deleteByGoogleEventIds(googleEventIds: string[], calendarId: string) {
    if (googleEventIds.length === 0) return

    const placeholders = googleEventIds.map((_, i) => `$${i + 1}`).join(", ")
    await db.execute(
      `DELETE FROM events WHERE google_event_id IN (${placeholders}) AND calendar_id = $${googleEventIds.length + 1}`,
      [...googleEventIds, calendarId],
    )
  },

  /**
   * Delete all events for a calendar (used before full sync)
   */
  async deleteByCalendarId(calendarId: string) {
    await db.execute("DELETE FROM events WHERE calendar_id = $1", [calendarId])
  },

  /**
   * Get events within a date range for selected calendars
   */
  async getByDateRange(
    calendarIds: string[],
    startDate: string,
    endDate: string,
  ): Promise<Event[]> {
    if (calendarIds.length === 0) return []

    const placeholders = calendarIds.map((_, i) => `$${i + 1}`).join(", ")
    const rows = await db.select<EventRow[]>(
      `SELECT * FROM events
        WHERE calendar_id IN (${placeholders})
        AND start >= $${calendarIds.length + 1}
        AND start <= $${calendarIds.length + 2}
        ORDER BY start ASC`,
      [...calendarIds, startDate, endDate],
    )

    return rows.map(rowToEvent)
  },

  /**
   * Get all events for selected calendars (for initial load)
   */
  async getByCalendarIds(calendarIds: string[]): Promise<Event[]> {
    if (calendarIds.length === 0) return []

    const placeholders = calendarIds.map((_, i) => `$${i + 1}`).join(", ")
    const rows = await db.select<EventRow[]>(
      `SELECT * FROM events
        WHERE calendar_id IN (${placeholders})
        ORDER BY start ASC`,
      calendarIds,
    )

    return rows.map(rowToEvent)
  },
})
