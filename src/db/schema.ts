import { index, integer, sqliteTable, text, unique } from "drizzle-orm/sqlite-core"
import { v4 as uuidv4 } from "uuid"

export const accounts = sqliteTable("accounts", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => uuidv4()),
  provider: text("provider").notNull().$type<"Google">(),
  email: text("email"),
  access_token: text("access_token"),
  refresh_token: text("refresh_token"),
  expires_at: integer("expires_at", { mode: "timestamp" }),
  created_at: integer("created_at", { mode: "timestamp" }).notNull(),
})

export const calendars = sqliteTable(
  "calendars",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuidv4()),
    account_id: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    provider_calendar_id: text("provider_calendar_id"),
    name: text("name").notNull(),
    color: text("color"),
    selected: integer("selected", { mode: "boolean" }).notNull().default(true),
    sync_token: text("sync_token"),
    last_synced_at: integer("last_synced_at", { mode: "timestamp" }),
  },
  (table) => [
    index("idx_calendars_account_id").on(table.account_id),
    unique().on(table.account_id, table.provider_calendar_id),
  ],
)

export const events = sqliteTable(
  "events",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuidv4()),
    provider_event_id: text("provider_event_id"),
    calendar_id: text("calendar_id")
      .notNull()
      .references(() => calendars.id, { onDelete: "cascade" }),
    summary: text("summary"),
    start: text("start").notNull(),
    end: text("end").notNull(),
    all_day: integer("all_day", { mode: "boolean" }).notNull(),
    updated_at: text("updated_at"),
  },
  (table) => [
    index("idx_events_calendar_id").on(table.calendar_id),
    index("idx_events_provider_event_id").on(table.provider_event_id),
    index("idx_events_start").on(table.start),
  ],
)
