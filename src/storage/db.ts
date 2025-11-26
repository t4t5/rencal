import Database from "@tauri-apps/plugin-sql"

import { accountStorage } from "@/storage/models/account"
import { calendarStorage } from "@/storage/models/calendar"
import { calendarEventStorage } from "@/storage/models/calendarEvent"

const DATABASE_NAME = "rencal.db"

export class Storage {
  account: ReturnType<typeof accountStorage>
  calendar: ReturnType<typeof calendarStorage>
  event: ReturnType<typeof calendarEventStorage>

  constructor(db: Database) {
    this.account = accountStorage(db)
    this.calendar = calendarStorage(db)
    this.event = calendarEventStorage(db)
  }
}

export const getDb = async () => {
  const db = await Database.load(`sqlite:${DATABASE_NAME}`)
  return new Storage(db)
}
