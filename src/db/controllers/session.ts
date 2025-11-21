import Database from "@tauri-apps/plugin-sql"

import { Session } from "@/rpc/bindings"

export const sessionController = (db: Database) => ({
  async get() {
    const [firstResult] = await db.select<Session[]>(
      "SELECT * FROM sessions WHERE provider = $1 LIMIT 1",
      ["Google"],
    )

    return firstResult
  },

  async insert(session: Session) {
    const { access_token, refresh_token, expires_at, provider, created_at } = session

    await db.execute(
      "INSERT OR REPLACE INTO sessions (access_token, refresh_token, expires_at, provider, created_at) VALUES ($1, $2, $3, $4, $5)",
      [access_token, refresh_token || "", expires_at, provider, created_at],
    )
  },

  async delete() {
    await db.execute("DELETE FROM sessions WHERE provider = $1", ["Google"])
  },
})
