import z from "zod"

export const calendarViewSchema = z.enum(["week", "month"])

export type CalendarView = z.infer<typeof calendarViewSchema>
