import Database from "@tauri-apps/plugin-sql"

import { sessionController } from "@/db/controllers/session"

import { calendarController } from "./controllers/calendar"
import { eventController } from "./controllers/events"

const DATABASE_NAME = "sequence.db"

export class Db {
  session: ReturnType<typeof sessionController>
  calendar: ReturnType<typeof calendarController>
  event: ReturnType<typeof eventController>

  constructor(db: Database) {
    this.session = sessionController(db)
    this.calendar = calendarController(db)
    this.event = eventController(db)
  }
}

export const getDb = async () => {
  const db = await Database.load(`sqlite:${DATABASE_NAME}`)
  return new Db(db)
}
