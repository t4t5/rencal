import { index, integer, sqliteTable, text, unique } from "drizzle-orm/sqlite-core"
import { v4 as uuidv4 } from "uuid"

export const accounts = sqliteTable("accounts", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => uuidv4()),
  provider: text("provider").notNull().$type<"Google">(),
  email: text("email"),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  expiresAt: integer("expires_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
})

export const calendars = sqliteTable(
  "calendars",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuidv4()),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    providerCalendarId: text("provider_calendar_id"),
    name: text("name").notNull(),
    color: text("color"),
    selected: integer("selected", { mode: "boolean" }).notNull().default(true),
    syncToken: text("sync_token"),
    lastSyncedAt: integer("last_synced_at", { mode: "timestamp" }),
  },
  (table) => [
    index("idx_calendars_account_id").on(table.accountId),
    unique().on(table.accountId, table.providerCalendarId),
  ],
)

export const events = sqliteTable(
  "events",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuidv4()),
    providerEventId: text("provider_event_id"),
    calendarId: text("calendar_id")
      .notNull()
      .references(() => calendars.id, { onDelete: "cascade" }),
    summary: text("summary"),
    start: integer("start", { mode: "timestamp" }).notNull(),
    end: integer("end", { mode: "timestamp" }).notNull(),
    allDay: integer("all_day", { mode: "boolean" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }),
  },
  (table) => [
    index("idx_events_calendar_id").on(table.calendarId),
    index("idx_events_provider_event_id").on(table.providerEventId),
    index("idx_events_start").on(table.start),
  ],
)
