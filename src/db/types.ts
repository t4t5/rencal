import type { InferInsertModel, InferSelectModel } from "drizzle-orm"

import type { CalendarDto, EventDto } from "@/rpc/bindings"

import { schema } from "./database"

// Legacy SQLite types (will be removed after caldir migration is complete)
export type EmailProvider = "Google" | "Apple"
export type Account = InferSelectModel<typeof schema.accounts>
export type LegacyCalendar = InferSelectModel<typeof schema.calendars>
export type LegacyCalendarEvent = InferSelectModel<typeof schema.events>
export type CalendarEventInsert = InferInsertModel<typeof schema.events>
export type Reminder = InferSelectModel<typeof schema.reminders>
export type ReminderInsert = InferInsertModel<typeof schema.reminders>

export interface DateRange {
  start: Date
  end: Date
}

// Calendar from caldir (~/calendar/*)
export interface Calendar extends CalendarDto {
  isVisible: boolean
}

// Event from caldir (.ics files)
export interface CalendarEvent {
  id: string
  calendarSlug: string
  summary: string | null
  description: string | null
  location: string | null
  start: Date
  end: Date
  allDay: boolean
  status: "confirmed" | "tentative" | "cancelled" | null
  isRecurring: boolean
  organizerEmail: string | null
}

// Draft event for creating new events
export interface DraftEvent {
  summary: string | null
  description: string | null
  location: string | null
  start: Date
  end: Date
  allDay: boolean
  calendarSlug: string
  recurrence: string | null
}

// Helper to convert EventDto from RPC to CalendarEvent
export function eventDtoToCalendarEvent(dto: EventDto): CalendarEvent {
  return {
    id: dto.id,
    calendarSlug: dto.calendarSlug,
    summary: dto.summary,
    description: dto.description,
    location: dto.location,
    start: new Date(dto.start),
    end: new Date(dto.end),
    allDay: dto.allDay,
    status: dto.status as "confirmed" | "tentative" | "cancelled" | null,
    isRecurring: dto.isRecurring,
    organizerEmail: dto.organizerEmail,
  }
}
