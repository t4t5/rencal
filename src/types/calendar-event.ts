import { z } from "zod"

export const calendarEventSchema = z.object({
  id: z.string(),
  provider_event_id: z.string().nullable(),
  calendar_id: z.string(),
  summary: z.string(),
  start: z.string(),
  end: z.string(),
  all_day: z.boolean(),
  updated_at: z.string().nullable(),
})

export type CalendarEvent = z.infer<typeof calendarEventSchema>
