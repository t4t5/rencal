import Database from "@tauri-apps/plugin-sql"

import { accountController } from "@/db/controllers/account"

import { calendarController } from "./controllers/calendar"
import { eventController } from "./controllers/events"

const DATABASE_NAME = "rencal.db"

export class Db {
  account: ReturnType<typeof accountController>
  calendar: ReturnType<typeof calendarController>
  event: ReturnType<typeof eventController>

  constructor(db: Database) {
    this.account = accountController(db)
    this.calendar = calendarController(db)
    this.event = eventController(db)
  }
}

export const getDb = async () => {
  const db = await Database.load(`sqlite:${DATABASE_NAME}`)
  return new Db(db)
}
