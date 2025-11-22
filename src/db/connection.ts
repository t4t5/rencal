import Database from "@tauri-apps/plugin-sql"

import { sessionController } from "@/db/controllers/session"

import { calendarController } from "./controllers/calendar"

const DATABASE_NAME = "sequence.db"

export class Db {
  session: ReturnType<typeof sessionController>
  calendar: ReturnType<typeof calendarController>

  constructor(db: Database) {
    this.session = sessionController(db)
    this.calendar = calendarController(db)
  }
}

export const getDb = async () => {
  const db = await Database.load(`sqlite:${DATABASE_NAME}`)
  return new Db(db)
}
