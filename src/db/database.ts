import TauriDatabase from "@tauri-apps/plugin-sql"
import type { InferInsertModel, InferSelectModel } from "drizzle-orm"
import { drizzle } from "drizzle-orm/sqlite-proxy"

import * as schema from "./schema"

// Re-export schema tables for use in queries
export { accounts, calendars, events } from "./schema"

export type Account = InferSelectModel<typeof schema.accounts>

export type Calendar = InferSelectModel<typeof schema.calendars>

export type CalendarEvent = InferSelectModel<typeof schema.events>
export type CalendarEventInsert = InferInsertModel<typeof schema.events>

const DATABASE_NAME = "rencal.db"

let sqliteInstance: TauriDatabase | null = null

async function getSqlite(): Promise<TauriDatabase> {
  if (!sqliteInstance) {
    sqliteInstance = await TauriDatabase.load(`sqlite:${DATABASE_NAME}`)
  }
  return sqliteInstance
}

function isSelectQuery(sql: string): boolean {
  return /^\s*SELECT\b/i.test(sql)
}

export const db = drizzle<typeof schema>(
  async (sql, params, method) => {
    const sqlite = await getSqlite()

    if (isSelectQuery(sql)) {
      const rows = await sqlite.select<Record<string, unknown>[]>(sql, params as unknown[])
      // Drizzle expects values as arrays, not objects
      const result = rows.map((row) => Object.values(row))
      return { rows: method === "all" ? result : result[0] }
    } else {
      await sqlite.execute(sql, params as unknown[])
      return { rows: [] }
    }
  },
  { schema },
)

export type Database = typeof db
