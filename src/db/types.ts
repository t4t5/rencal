import type { InferInsertModel, InferSelectModel } from "drizzle-orm"

import { schema } from "./database"

export type Account = InferSelectModel<typeof schema.accounts>
export type Calendar = InferSelectModel<typeof schema.calendars>
export type CalendarEvent = InferSelectModel<typeof schema.events>
export type CalendarEventInsert = InferInsertModel<typeof schema.events>
