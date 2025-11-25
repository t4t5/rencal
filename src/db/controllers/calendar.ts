import Database from "@tauri-apps/plugin-sql"

import { Calendar } from "@/rpc/bindings"

// Raw DB row type - SQLite returns integers for booleans
type CalendarRow = {
  id: string
  google_calendar_id: string | null
  name: string
  color: string | null
  selected: number
  sync_token: string | null
  last_synced_at: number | null
}

const rowToCalendar = (row: CalendarRow): Calendar => ({
  id: row.id,
  google_calendar_id: row.google_calendar_id,
  name: row.name,
  color: row.color,
  selected: row.selected === 1,
  sync_token: row.sync_token,
  last_synced_at: row.last_synced_at ? String(row.last_synced_at) : null,
})

export const calendarController = (db: Database) => ({
  async add(calendar: Calendar) {
    await db.execute(
      `INSERT OR REPLACE INTO calendars
        (id, google_calendar_id, name, color, selected, sync_token, last_synced_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        calendar.id,
        calendar.google_calendar_id,
        calendar.name,
        calendar.color || "",
        calendar.selected ? 1 : 0,
        calendar.sync_token,
        calendar.last_synced_at ? Number(calendar.last_synced_at) : null,
      ],
    )
  },

  async list(): Promise<Calendar[]> {
    const rows = await db.select<CalendarRow[]>("SELECT * FROM calendars")
    return rows.map(rowToCalendar)
  },

  async listActive(): Promise<Calendar[]> {
    const rows = await db.select<CalendarRow[]>("SELECT * FROM calendars WHERE selected = 1")
    return rows.map(rowToCalendar)
  },

  async findByGoogleCalendarId(googleCalendarId: string): Promise<Calendar | null> {
    const rows = await db.select<CalendarRow[]>(
      "SELECT * FROM calendars WHERE google_calendar_id = $1",
      [googleCalendarId],
    )
    return rows.length > 0 ? rowToCalendar(rows[0]) : null
  },

  async updateGoogleSyncToken({
    googleCalendarId,
    syncToken,
  }: {
    googleCalendarId: string
    syncToken: string
  }) {
    await db.execute(
      `UPDATE calendars SET sync_token = $1, last_synced_at = $2 WHERE google_calendar_id = $3`,
      [syncToken, Date.now(), googleCalendarId],
    )
  },
})
