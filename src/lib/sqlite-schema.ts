import { z } from "zod"

// SQLite stores booleans as 0/1
export const sqliteBool = z.number().transform((n) => n === 1)

// SQLite stores dates as ISO strings
export const sqliteDate = z.string().transform((s) => new Date(s))
export const sqliteDateNullable = z
  .string()
  .nullable()
  .transform((s) => (s ? new Date(s) : null))
