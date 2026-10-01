// The calendar shown in the website's app window: the data from the original
// landing-page demo video, frozen on Thu 25 Jun 2026.

export const TODAY = "2026-06-25"

/** The months the window can show (minical and month view). */
export const MONTH_START = "2026-06-01"

/** First day in the agenda (the demo never scrolls it further back). */
export const AGENDA_START = "2026-06-10"
export const AGENDA_END = "2026-07-12"

export interface DemoCalendar {
  name: string
  color: string
}

export const CALENDARS = {
  work: { name: "Work", color: "#2885e0" },
  personal: { name: "Personal", color: "#f77b52" },
  john: { name: "john@gmail.com", color: "#ebbd2b" },
} satisfies Record<string, DemoCalendar>

export type CalendarId = keyof typeof CALENDARS

export interface DemoEvent {
  id: string
  calendar: CalendarId
  date: string
  /** "HH:MM"; omitted for all-day events. */
  start?: string
  end?: string
  title: string
  location?: string
  /** Video meeting link; the event form shows a join button instead of "Add Google Meet". */
  conference?: string
  /** Hidden until the demo creates it from the compose box. */
  created?: boolean
}

const event = (
  calendar: CalendarId,
  date: string,
  start: string | null,
  end: string | null,
  title: string,
  extra: Partial<DemoEvent> = {},
): DemoEvent => ({
  id: `${date}-${title}`.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
  calendar,
  date,
  ...(start && end ? { start, end } : {}),
  title,
  ...extra,
})

export const EVENTS: DemoEvent[] = [
  event("personal", "2026-06-01", "18:00", "19:30", "Pottery class"),
  event("work", "2026-06-02", "10:00", "11:00", "Quarterly planning"),
  event("personal", "2026-06-03", "19:30", "21:30", "Book club"),
  event("work", "2026-06-04", "14:00", "15:00", "Customer interview"),
  event("personal", "2026-06-06", "11:00", "13:00", "Farmers market"),
  event("personal", "2026-06-08", "10:00", "11:00", "Laundry"),
  event("work", "2026-06-09", "11:00", "12:00", "Data pipeline incident review"),
  event("personal", "2026-06-11", "18:45", "19:45", "Yoga class"),
  event("work", "2026-06-12", "16:00", "16:45", "Founders all-hands"),
  event("personal", "2026-06-13", "19:00", "22:00", "Birthday drinks for Tom"),
  event("personal", "2026-06-15", "13:00", "15:30", "Sunday roast with friends"),
  event("work", "2026-06-17", "13:30", "15:00", "Pairing on auth flow"),
  event("personal", "2026-06-18", null, null, "Recycling collection"),
  event("work", "2026-06-19", "17:00", "18:00", "Release 1.8.0 deploy"),
  event("personal", "2026-06-20", "14:00", "16:00", "IKEA delivery slot"),
  event("personal", "2026-06-22", "20:00", "22:30", "Eurostar weekend to Paris"),
  event("work", "2026-06-23", "10:30", "11:30", "Design handoff review"),
  event("work", "2026-06-25", "11:00", "12:00", "Backend API planning", {
    location: "Meeting Room 2",
    conference: "https://teams.microsoft.com/l/meetup-join/backend-api-planning",
  }),
  event("work", "2026-06-26", "09:30", "10:00", "Product stand-up", {
    location: "Old Street office",
  }),
  event("personal", "2026-06-26", "19:00", "20:00", "Grocery delivery"),
  event("john", "2026-06-27", "20:00", "21:00", "Dinner", { created: true }),
  event("personal", "2026-06-28", "10:30", "12:30", "Sunday walk and coffee"),
  event("work", "2026-06-29", "14:00", "14:30", "1:1 with John"),
  event("personal", "2026-06-30", "09:00", "10:00", "Boiler service"),
  event("work", "2026-07-01", "10:00", "11:00", "Sprint planning"),
  event("work", "2026-07-02", "15:30", "16:30", "Investor demo rehearsal"),
  event("personal", "2026-07-03", "19:30", "22:00", "West End theatre night"),
  event("personal", "2026-07-05", null, null, "Council tax payment"),
  event("work", "2026-07-06", "09:30", "10:00", "Product stand-up"),
  event("personal", "2026-07-07", "18:30", "19:30", "Climbing session"),
  event("work", "2026-07-08", "11:00", "12:00", "Roadmap review"),
  event("work", "2026-07-09", "15:00", "16:00", "Hiring sync"),
  event("personal", "2026-07-10", "20:00", "23:00", "Summer party"),
  event("personal", "2026-07-12", "12:00", "14:00", "Picnic in the park"),
]

/** The calendar new events go to (the compose form's default). */
export const DEFAULT_CALENDAR: CalendarId = "john"
export const DEFAULT_REMINDERS = ["10 minutes", "1 hour", "2 hours"]

// Dates are plain "YYYY-MM-DD" strings; arithmetic runs in UTC so no zone applies.
const toDate = (key: string) => new Date(`${key}T00:00:00Z`)
const toKey = (date: Date) => date.toISOString().slice(0, 10)

export function addDays(key: string, days: number): string {
  const date = toDate(key)
  date.setUTCDate(date.getUTCDate() + days)
  return toKey(date)
}

export function dayRange(start: string, end: string): string[] {
  const days: string[] = []
  for (let day = start; day <= end; day = addDays(day, 1)) days.push(day)
  return days
}

const format = (key: string, options: Intl.DateTimeFormatOptions) =>
  toDate(key).toLocaleDateString("en-GB", { timeZone: "UTC", ...options })

export const dayOfMonth = (key: string) => toDate(key).getUTCDate()
export const monthName = (key: string) => format(key, { month: "long" })
export const weekdayName = (key: string) => format(key, { weekday: "long" })
/** "25 Jun" */
export const shortDate = (key: string) => format(key, { day: "numeric", month: "short" })
/** "Thu, 25 Jun", as in the event form. */
export const formDate = (key: string) => `${format(key, { weekday: "short" })}, ${shortDate(key)}`
/** Monday = 0 … Sunday = 6 */
export const weekdayIndex = (key: string) => (toDate(key).getUTCDay() + 6) % 7
export const isWeekend = (key: string) => weekdayIndex(key) >= 5

/** Agenda header label: Yesterday/Today/Tomorrow, else the weekday. */
export function relativeDayLabel(key: string): string {
  if (key === TODAY) return "Today"
  if (key === addDays(TODAY, 1)) return "Tomorrow"
  if (key === addDays(TODAY, -1)) return "Yesterday"
  return weekdayName(key)
}

export const eventsOn = (key: string) =>
  EVENTS.filter((e) => e.date === key).sort((a, b) => (a.start ?? "").localeCompare(b.start ?? ""))
