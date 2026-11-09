import type { MessageDescriptor } from "@lingui/core"
import { msg } from "@lingui/core/macro"

import type { Calendar } from "@/lib/api"

interface EventColor {
  name: MessageDescriptor
  hex: string
}

/** Google Calendar's event colors, in the order its color picker shows them. */
export const EVENT_COLORS: EventColor[] = [
  { name: msg({ message: "Tomato", context: "event color" }), hex: "#d50000" },
  { name: msg({ message: "Flamingo", context: "event color" }), hex: "#e67c73" },
  { name: msg({ message: "Tangerine", context: "event color" }), hex: "#f4511e" },
  { name: msg({ message: "Banana", context: "event color" }), hex: "#f6bf26" },
  { name: msg({ message: "Sage", context: "event color" }), hex: "#33b679" },
  { name: msg({ message: "Basil", context: "event color" }), hex: "#0b8043" },
  { name: msg({ message: "Peacock", context: "event color" }), hex: "#039be5" },
  { name: msg({ message: "Blueberry", context: "event color" }), hex: "#3f51b5" },
  { name: msg({ message: "Lavender", context: "event color" }), hex: "#7986cb" },
  { name: msg({ message: "Grape", context: "event color" }), hex: "#8e24aa" },
  { name: msg({ message: "Graphite", context: "event color" }), hex: "#616161" },
]

/** Only Google syncs a per-event color; elsewhere events use their calendar's. */
export const supportsEventColor = (calendar?: Calendar): boolean => calendar?.provider === "google"

/** Drop an event color when the target calendar can't store one. */
export const eventColorForCalendar = (color: string | null, calendar?: Calendar): string | null =>
  supportsEventColor(calendar) ? color : null
