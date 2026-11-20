import type { TimeFormat } from "@/lib/event-time"

export type TimeOfDay = { hour: number; minute: number }

const SLOT_MINUTES = [0, 15, 30, 45]

const quarterSlots = (hour: number): TimeOfDay[] => SLOT_MINUTES.map((minute) => ({ hour, minute }))

const ALL_SLOTS: TimeOfDay[] = Array.from({ length: 24 }, (_, hour) => quarterSlots(hour)).flat()

export const timeKey = (t: TimeOfDay) =>
  `${String(t.hour).padStart(2, "0")}:${String(t.minute).padStart(2, "0")}`

/**
 * Candidate times for a typed query. Empty query → every 15-minute slot, plus
 * `current` in order when it's off the grid, so 09:07 has a row to stay on.
 * Accepts "15:30", "3:30pm", "3pm", "3" (hour only → that hour's quarters).
 * In 12h mode an ambiguous hour with no am/pm yields both AM and PM.
 */
export function timeOptions(
  query: string,
  timeFormat: TimeFormat,
  current?: TimeOfDay | null,
): TimeOfDay[] {
  const q = query.trim().toLowerCase()

  if (!q) {
    if (!current || current.minute % 15 === 0) return ALL_SLOTS
    const later = ALL_SLOTS.findIndex(
      (t) => t.hour * 60 + t.minute > current.hour * 60 + current.minute,
    )
    const at = later === -1 ? ALL_SLOTS.length : later
    return [...ALL_SLOTS.slice(0, at), current, ...ALL_SLOTS.slice(at)]
  }

  const match = q.match(/^(\d{1,2})(?::(\d{1,2}))?\s*(am?|pm?)?$/)

  if (!match) return []

  const rawHour = Number(match[1])
  const hasMinute = match[2] !== undefined
  const minute = hasMinute ? Number(match[2]) : 0
  const period = match[3]?.[0] as "a" | "p" | undefined

  if (minute > 59) return []

  if (period) {
    if (rawHour < 1 || rawHour > 12) return []

    const hour =
      period === "p" ? (rawHour === 12 ? 12 : rawHour + 12) : rawHour === 12 ? 0 : rawHour

    return hasMinute ? [{ hour, minute }] : quarterSlots(hour)
  }

  if (rawHour > 23) return []

  // No am/pm given. In 12h mode an hour ≤ 12 is ambiguous → offer AM and PM.
  if (timeFormat === "12h" && rawHour >= 1 && rawHour <= 12) {
    const am = rawHour === 12 ? 0 : rawHour
    const pm = rawHour === 12 ? 12 : rawHour + 12

    return hasMinute
      ? [
          { hour: am, minute },
          { hour: pm, minute },
        ]
      : [...quarterSlots(am), ...quarterSlots(pm)]
  }

  return hasMinute ? [{ hour: rawHour, minute }] : quarterSlots(rawHour)
}
