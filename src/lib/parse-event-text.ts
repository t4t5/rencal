import * as chrono from "chrono-node"
import { addMinutes, startOfDay } from "date-fns"

import type { Recurrence } from "@/rpc/bindings"

const DEFAULT_DURATION_MINUTES = 30

interface ParsedEventText {
  summary: string
  start: Date | null
  end: Date | null
  allDay: boolean
  recurrence: Recurrence | null
}

const DAYS_MAP: Record<string, string> = {
  monday: "MO",
  tuesday: "TU",
  wednesday: "WE",
  thursday: "TH",
  friday: "FR",
  saturday: "SA",
  sunday: "SU",
}

const DAY_NAMES = Object.keys(DAYS_MAP).join("|")
const RECURRENCE_PATTERN = new RegExp(
  `\\bevery\\s+(day|week|month|year|weekday|weekend|${DAY_NAMES})\\b`,
  "i",
)

function parseRecurrence(text: string): { rrule: string; textForChrono: string } | null {
  const match = text.match(RECURRENCE_PATTERN)
  if (!match) return null

  const unit = match[1].toLowerCase()
  let rrule: string

  const isDayName = unit in DAYS_MAP

  if (isDayName) {
    rrule = `FREQ=WEEKLY;BYDAY=${DAYS_MAP[unit]}`
  } else {
    switch (unit) {
      case "day":
        rrule = "FREQ=DAILY"
        break
      case "week":
        rrule = "FREQ=WEEKLY"
        break
      case "month":
        rrule = "FREQ=MONTHLY"
        break
      case "year":
        rrule = "FREQ=YEARLY"
        break
      case "weekday":
        rrule = "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR"
        break
      case "weekend":
        rrule = "FREQ=WEEKLY;BYDAY=SA,SU"
        break
      default:
        return null
    }
  }

  // For day names, keep the day in the text so chrono can resolve the start date.
  // For other units, remove the whole "every ..." match.
  const before = text.slice(0, match.index)
  const after = text.slice(match.index! + match[0].length)
  const textForChrono = isDayName
    ? (before + unit + after).replace(/\s{2,}/g, " ").trim()
    : (before + after).replace(/\s{2,}/g, " ").trim()

  return { rrule, textForChrono }
}

function removeMatchAndConnectors(text: string, matchIndex: number, matchText: string): string {
  const before = text.slice(0, matchIndex)
  const after = text.slice(matchIndex + matchText.length)

  const cleanedBefore = before.replace(/\b(at|on|for|from)\s*$/i, "")

  return (cleanedBefore + after).replace(/\s{2,}/g, " ")
}

export function parseEventText(text: string, referenceDate: Date = new Date()): ParsedEventText {
  const recurrenceResult = parseRecurrence(text)

  const recurrence: Recurrence | null = recurrenceResult
    ? { rrule: recurrenceResult.rrule, exdates: [] }
    : null

  const textForChrono = recurrenceResult ? recurrenceResult.textForChrono : text

  const results = chrono.parse(textForChrono, referenceDate, { forwardDate: true })

  if (results.length === 0) {
    return { summary: textForChrono.trim(), start: null, end: null, allDay: false, recurrence }
  }

  const result = results[0]

  let summary = removeMatchAndConnectors(textForChrono, result.index, result.text)
  summary = summary.trim()

  const allDay = !result.start.isCertain("hour")

  const start = allDay ? startOfDay(result.start.date()) : result.start.date()

  const end = result.end
    ? result.end.date()
    : allDay
      ? startOfDay(result.start.date())
      : addMinutes(start, DEFAULT_DURATION_MINUTES)

  return { summary, start, end, allDay, recurrence }
}
