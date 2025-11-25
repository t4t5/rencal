import { z } from "zod"

export const CalendarSchema = z.object({
  id: z.string(),
  account_id: z.string(),
  provider_calendar_id: z.string().nullable(),
  name: z.string(),
  color: z.string().nullable(),
  selected: z.boolean(),
  sync_token: z.string().nullable(),
  last_synced_at: z.string().nullable(),
})

export type Calendar = z.infer<typeof CalendarSchema>
