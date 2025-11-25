import Database from "@tauri-apps/plugin-sql"

import { Account, accountSchema } from "@/types/account"

export const accountController = (db: Database) => ({
  async getAll(): Promise<Account[]> {
    const rows = await db.select<unknown[]>("SELECT * FROM accounts")
    return rows.map((row) => accountSchema.parse(row))
  },

  async getById(id: string): Promise<Account | undefined> {
    const [row] = await db.select<unknown[]>("SELECT * FROM accounts WHERE id = $1", [id])
    return row ? accountSchema.parse(row) : undefined
  },

  async insert(account: Account) {
    const { id, provider, email, access_token, refresh_token, expires_at, created_at } = account

    await db.execute(
      "INSERT OR REPLACE INTO accounts (id, provider, email, access_token, refresh_token, expires_at, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)",
      [id, provider, email, access_token, refresh_token, expires_at, created_at],
    )
  },

  async update(account: Account) {
    const { id, provider, email, access_token, refresh_token, expires_at, created_at } = account

    await db.execute(
      "UPDATE accounts SET provider = $2, email = $3, access_token = $4, refresh_token = $5, expires_at = $6, created_at = $7 WHERE id = $1",
      [id, provider, email, access_token, refresh_token, expires_at, created_at],
    )
  },

  async delete(id: string) {
    await db.execute("DELETE FROM accounts WHERE id = $1", [id])
  },

  async deleteAll() {
    await db.execute("DELETE FROM accounts")
  },
})
