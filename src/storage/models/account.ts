import Database from "@tauri-apps/plugin-sql"
import { v4 as uuidv4 } from "uuid"
import { z } from "zod"

import { sqliteDate, sqliteDateNullable } from "@/lib/sqlite-schema"

const accountSchema = z.object({
  id: z.string(),
  provider: z.literal("Google"),
  email: z.string().nullable(),
  access_token: z.string().nullable(),
  refresh_token: z.string().nullable(),
  expires_at: sqliteDateNullable,
  created_at: sqliteDate,
})

export type Account = z.output<typeof accountSchema>
export type AccountInsertData = Omit<Account, "id" | "created_at">

export const accountStorage = (db: Database) => ({
  async getAll(): Promise<Account[]> {
    const rows = await db.select<unknown[]>("SELECT * FROM accounts")
    return rows.map((row) => accountSchema.parse(row))
  },

  async getById(id: string): Promise<Account | undefined> {
    const [row] = await db.select<unknown[]>("SELECT * FROM accounts WHERE id = $1", [id])
    return row ? accountSchema.parse(row) : undefined
  },

  async insert(account: AccountInsertData) {
    const { provider, email, access_token, refresh_token, expires_at } = account

    await db.execute(
      `INSERT OR REPLACE INTO accounts (
        id, provider, email, access_token, refresh_token, expires_at, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        uuidv4(),
        provider,
        email,
        access_token,
        refresh_token,
        expires_at?.toISOString() ?? null,
        new Date().toISOString(),
      ],
    )
  },

  async update(account: Account) {
    const { id, provider, email, access_token, refresh_token, expires_at } = account

    await db.execute(
      `UPDATE accounts SET
        provider = $2,
        email = $3,
        access_token = $4,
        refresh_token = $5,
        expires_at = $6,
      WHERE id = $1`,
      [id, provider, email, access_token, refresh_token, expires_at?.toISOString() ?? null],
    )
  },

  async delete(id: string) {
    await db.execute("DELETE FROM accounts WHERE id = $1", [id])
  },
})
