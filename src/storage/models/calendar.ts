import Database from "@tauri-apps/plugin-sql"
import { v4 as uuidv4 } from "uuid"
import { z } from "zod"

import { Calendar } from "@/types/calendar"

const storedCalendarSchema = z
  .object({
    id: z.string(),
    account_id: z.string(),
    provider_calendar_id: z.string().nullable(),
    name: z.string(),
    color: z.string().nullable(),
    selected: z.number(),
    sync_token: z.string().nullable(),
    last_synced_at: z.number().nullable(),
  })
  .transform(
    // Transform DB row to Calendar type
    (row): Calendar => ({
      ...row,
      selected: row.selected === 1,
      // TODO: Use Date type:
      last_synced_at: row.last_synced_at ? String(row.last_synced_at) : null,
    }),
  )

export type CalendarInsertData = Omit<Calendar, "id">

export const calendarStorage = (db: Database) => ({
  async list(): Promise<Calendar[]> {
    const rows = await db.select<unknown[]>("SELECT * FROM calendars")
    return rows.map((row) => storedCalendarSchema.parse(row))
  },

  async listActive(): Promise<Calendar[]> {
    const rows = await db.select<unknown[]>("SELECT * FROM calendars WHERE selected = 1")
    return rows.map((row) => storedCalendarSchema.parse(row))
  },

  async findByProviderCalendarId(providerCalendarId: string): Promise<Calendar | null> {
    const [row] = await db.select<unknown[]>(
      "SELECT * FROM calendars WHERE provider_calendar_id = $1",
      [providerCalendarId],
    )
    return row ? storedCalendarSchema.parse(row) : null
  },

  async updateSyncToken({
    providerCalendarId,
    syncToken,
  }: {
    providerCalendarId: string
    syncToken: string
  }) {
    await db.execute(
      `UPDATE calendars
      SET sync_token = $1, last_synced_at = $2
      WHERE provider_calendar_id = $3`,
      [syncToken, Date.now(), providerCalendarId],
    )
  },

  async add(calendar: CalendarInsertData) {
    const { account_id, provider_calendar_id, name, color, selected, sync_token, last_synced_at } =
      calendar

    await db.execute(
      `INSERT INTO calendars(
          id,
          account_id,
          provider_calendar_id,
          name,
          color,
          selected,
          sync_token,
          last_synced_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8
        ) ON CONFLICT(account_id, provider_calendar_id) 
          DO UPDATE SET
            name = excluded.name,
            color = excluded.color`,
      [
        uuidv4(),
        account_id,
        provider_calendar_id,
        name,
        color || "",
        selected ? 1 : 0,
        sync_token,
        last_synced_at ? Number(last_synced_at) : null,
      ],
    )
  },
})
