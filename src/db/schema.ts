import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core"
import { v4 as uuidv4 } from "uuid"

export const calendars = sqliteTable("calendars", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => uuidv4()),
  slug: text("slug").notNull().unique(),
  isVisible: integer("is_visible", { mode: "boolean" }).notNull().default(true),
})
