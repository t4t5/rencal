import type { Calendar } from "@/lib/api"

interface EventColor {
  name: string
  hex: string
}

/** Google Calendar's event colors, in the order its color picker shows them. */
export const EVENT_COLORS: EventColor[] = [
  { name: "Tomato", hex: "#d50000" },
  { name: "Flamingo", hex: "#e67c73" },
  { name: "Tangerine", hex: "#f4511e" },
  { name: "Banana", hex: "#f6bf26" },
  { name: "Sage", hex: "#33b679" },
  { name: "Basil", hex: "#0b8043" },
  { name: "Peacock", hex: "#039be5" },
  { name: "Blueberry", hex: "#3f51b5" },
  { name: "Lavender", hex: "#7986cb" },
  { name: "Grape", hex: "#8e24aa" },
  { name: "Graphite", hex: "#616161" },
]

/** Only Google syncs a per-event color; elsewhere events use their calendar's. */
export const supportsEventColor = (calendar?: Calendar): boolean => calendar?.provider === "google"

/** Drop an event color when the target calendar can't store one. */
export const eventColorForCalendar = (color: string | null, calendar?: Calendar): string | null =>
  supportsEventColor(calendar) ? color : null
