import type { InferInsertModel, InferSelectModel } from "drizzle-orm"

import { schema } from "./database"

export type EmailProvider = "Google" | "Apple"

export type Account = InferSelectModel<typeof schema.accounts>
export type Calendar = InferSelectModel<typeof schema.calendars>
export type CalendarEvent = InferSelectModel<typeof schema.events>
export type CalendarEventInsert = InferInsertModel<typeof schema.events>
export type Reminder = InferSelectModel<typeof schema.reminders>
export type ReminderInsert = InferInsertModel<typeof schema.reminders>

export type DraftEvent = CalendarEventInsert

export interface DateRange {
  start: Date
  end: Date
}
