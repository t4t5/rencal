import Database from "@tauri-apps/plugin-sql"

const DATABASE_NAME = "sequence.db"

export const getDb = async () => {
  const db = await Database.load(`sqlite:${DATABASE_NAME}`)
  return db
}
