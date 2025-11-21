import Database from "@tauri-apps/plugin-sql"

import { sessionController } from "@/db/controllers/session"

const DATABASE_NAME = "sequence.db"

export class Db {
  session: ReturnType<typeof sessionController>

  constructor(db: Database) {
    this.session = sessionController(db)
  }
}

export const getDb = async () => {
  const db = await Database.load(`sqlite:${DATABASE_NAME}`)
  return new Db(db)
}
