import { ReactNode, useState } from "react"

import { Combobox } from "@/components/ui/combo-box"
import { CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command"

import type { TimeFormat } from "@/rpc/bindings"

import { useSettings } from "@/contexts/SettingsContext"

import { formatWallclockTime, isAllDay, wallclockTime, type EventTime } from "@/lib/event-time"
import { cn } from "@/lib/utils"

type TimeOfDay = { hour: number; minute: number }

const SLOT_MINUTES = [0, 15, 30, 45]

const ALL_SLOTS: TimeOfDay[] = Array.from({ length: 24 }, (_, hour) =>
  SLOT_MINUTES.map((minute) => ({ hour, minute })),
).flat()

const quarterSlots = (hour: number): TimeOfDay[] => SLOT_MINUTES.map((minute) => ({ hour, minute }))

const slotKey = (t: TimeOfDay) =>
  `${String(t.hour).padStart(2, "0")}:${String(t.minute).padStart(2, "0")}`

const LAST_SLOT = 23 * 60 + 45

/** The 15-minute slot closest to a wallclock time, so off-grid times still
 * map to a row we can highlight and scroll to (e.g. 09:07 → 09:00). */
const nearestSlotKey = (hour: number, minute: number): string => {
  const minutes = Math.min(Math.round((hour * 60 + minute) / 15) * 15, LAST_SLOT)
  return slotKey({ hour: Math.floor(minutes / 60), minute: minutes % 60 })
}

/**
 * Candidate times for a typed query. Empty query → every 15-minute slot.
 * Accepts "15:30", "3:30pm", "3pm", "3" (hour only → that hour's quarters).
 * In 12h mode an ambiguous hour with no am/pm yields both AM and PM.
 */
function getTimeOptions(query: string, timeFormat: TimeFormat): TimeOfDay[] {
  const q = query.trim().toLowerCase()

  if (!q) return ALL_SLOTS

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

/**
 * A combobox time input that honors the 12h/24h setting on every locale
 * (unlike a native `<input type="time">`, whose format follows the OS locale).
 * Edits the wallclock time in the event's own zone via `onChange`.
 */
export const TimeInput = ({
  value,
  addon,
  readOnly,
  disabled,
  onChange,
}: {
  value: EventTime
  addon?: ReactNode
  readOnly?: boolean
  disabled?: boolean
  onChange: (hour: number, minute: number) => void
}) => {
  const { timeFormat } = useSettings()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  // The cmdk-selected row: highlighted and scrolled into view on open. Starts
  // at the current value's slot, then follows the typed query / pointer.
  const [highlighted, setHighlighted] = useState<string>()

  const { hour, minute } = wallclockTime(value)
  const currentLabel = isAllDay(value) ? "" : formatWallclockTime(hour, minute, timeFormat)
  const currentSlotKey = isAllDay(value) ? undefined : nearestSlotKey(hour, minute)
  const options = getTimeOptions(query, timeFormat)

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    setQuery("")
    if (next) setHighlighted(currentSlotKey)
  }

  // Keep the highlight on the best match as the query changes, falling back to
  // the current value when the query is cleared.
  const handleQueryChange = (next: string) => {
    setQuery(next)
    const [best] = getTimeOptions(next, timeFormat)
    setHighlighted(next.trim() ? best && slotKey(best) : currentSlotKey)
  }

  const commit = (t: TimeOfDay) => {
    onChange(t.hour, t.minute)
    setOpen(false)
    setQuery("")
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return

    e.preventDefault()

    const trimmed = query.trim()

    if (trimmed) {
      const [best] = getTimeOptions(trimmed, timeFormat)

      if (!best) return // unparseable — keep editing

      onChange(best.hour, best.minute)
    }

    setOpen(false)
    setQuery("")
  }

  return (
    <Combobox
      addon={addon}
      placeholder={currentLabel}
      query={open ? query : currentLabel}
      setQuery={handleQueryChange}
      open={open}
      setOpen={handleOpenChange}
      readOnly={readOnly}
      disabled={disabled}
      onInputKeyDown={handleKeyDown}
      highlightedValue={highlighted}
      onHighlightChange={setHighlighted}
    >
      {options.length ? (
        <CommandGroup>
          {options.map((t) => {
            const key = slotKey(t)
            return (
              <CommandItem
                key={key}
                value={key}
                onSelect={() => commit(t)}
                className={cn(key === currentSlotKey && "font-medium")}
              >
                {formatWallclockTime(t.hour, t.minute, timeFormat)}
              </CommandItem>
            )
          })}
        </CommandGroup>
      ) : (
        <CommandEmpty>No results found.</CommandEmpty>
      )}
    </Combobox>
  )
}
