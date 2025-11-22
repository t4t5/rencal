import Database from "@tauri-apps/plugin-sql"

import { Calendar } from "@/rpc/bindings"

export const calendarController = (db: Database) => ({
  async add(calendar: Calendar) {
    await db.execute(
      "INSERT OR REPLACE INTO calendars (id, name, color, selected) VALUES ($1, $2, $3, $4)",
      [calendar.id, calendar.name, calendar.color || "", calendar.selected ? 1 : 0],
    )
  },

  async list() {
    const calendars = await db.select<Calendar[]>("SELECT * FROM calendars")
    return calendars
  },
})
