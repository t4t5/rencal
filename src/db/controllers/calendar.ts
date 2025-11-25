import Database from "@tauri-apps/plugin-sql"

import { Calendar } from "@/types/calendar"

// Raw DB row type - SQLite returns integers for booleans
type CalendarRow = {
  id: string
  account_id: string
  provider_calendar_id: string | null
  name: string
  color: string | null
  selected: number
  sync_token: string | null
  last_synced_at: number | null
}

const rowToCalendar = (row: CalendarRow): Calendar => ({
  id: row.id,
  account_id: row.account_id,
  provider_calendar_id: row.provider_calendar_id,
  name: row.name,
  color: row.color,
  selected: row.selected === 1,
  sync_token: row.sync_token,
  last_synced_at: row.last_synced_at ? String(row.last_synced_at) : null,
})

export const calendarController = (db: Database) => ({
  async add(calendar: Calendar) {
    await db.execute(
      `INSERT INTO calendars
        (id, account_id, provider_calendar_id, name, color, selected, sync_token, last_synced_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT(account_id, provider_calendar_id) DO UPDATE SET
          name = excluded.name,
          color = excluded.color`,
      [
        calendar.id,
        calendar.account_id,
        calendar.provider_calendar_id,
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

  async findByProviderCalendarId(providerCalendarId: string): Promise<Calendar | null> {
    const rows = await db.select<CalendarRow[]>(
      "SELECT * FROM calendars WHERE provider_calendar_id = $1",
      [providerCalendarId],
    )
    return rows.length > 0 ? rowToCalendar(rows[0]) : null
  },

  async updateSyncToken({
    providerCalendarId,
    syncToken,
  }: {
    providerCalendarId: string
    syncToken: string
  }) {
    await db.execute(
      `UPDATE calendars SET sync_token = $1, last_synced_at = $2 WHERE provider_calendar_id = $3`,
      [syncToken, Date.now(), providerCalendarId],
    )
  },
})
