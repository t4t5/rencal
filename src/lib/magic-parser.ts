import * as chrono from "chrono-node"
import { addDays, addMinutes, startOfDay } from "date-fns"

import type { Recurrence } from "@/lib/cal-events"
import {
  DEFAULT_DURATION_MINS,
  fromDate,
  getLocalTzid,
  plainDate,
  type EventTime,
} from "@/lib/event-time"

interface ParsedEventSegments {
  summary: string
  start: EventTime | null
  end: EventTime | null
  recurrence: Recurrence | null
  location: string | null
  // Raw chrono match text from the input. Used by segmentEventText to locate
  // the time range in the original text without re-running chrono.
  chronoMatchText: string | null
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

function parseLocation(summary: string): { summary: string; location: string | null } {
  const match = summary.match(/\b(?:at|in)\s+(.+)$/i)
  if (!match || !match[1].trim()) return { summary, location: null }

  const location = match[1].trim()
  const cleaned = summary.slice(0, match.index).trim()

  return { summary: cleaned, location }
}

function removeMatchAndConnectors(text: string, matchIndex: number, matchText: string): string {
  const before = text.slice(0, matchIndex)
  const after = text.slice(matchIndex + matchText.length)

  const cleanedBefore = before.replace(/\b(at|on|for|from)\s*$/i, "")

  return (cleanedBefore + after).replace(/\s{2,}/g, " ")
}

export interface TextSegment {
  text: string
  parsed: boolean
}

/**
 * Splits the raw input text into plain and parsed segments for visual highlighting.
 * Runs recurrence/time/location detection directly on the original text to identify ranges.
 */
export function segmentEventText(text: string, referenceDate: Date = new Date()): TextSegment[] {
  if (!text.trim()) return [{ text, parsed: false }]

  const parsed = parseEventText(text, referenceDate)

  if (!parsed.start && !parsed.recurrence && !parsed.location) {
    return [{ text, parsed: false }]
  }

  const ranges: Array<{ start: number; end: number }> = []

  // Recurrence range
  const recMatch = text.match(RECURRENCE_PATTERN)
  if (recMatch && recMatch.index !== undefined) {
    ranges.push({ start: recMatch.index, end: recMatch.index + recMatch[0].length })
  }

  // Time range — locate the chrono match in the original text. We use indexOf
  // instead of re-running chrono.parse here to keep typing responsive.
  if (parsed.start && parsed.chronoMatchText) {
    const searchFrom = recMatch ? recMatch.index! + recMatch[0].length : 0
    const idx = text.indexOf(parsed.chronoMatchText, searchFrom)
    if (idx >= 0) {
      ranges.push({ start: idx, end: idx + parsed.chronoMatchText.length })
    }
  }

  // Location range — find trailing "at/in {location}" in original text
  if (parsed.location) {
    const escaped = parsed.location.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    const locRegex = new RegExp(`${escaped}\\s*$`, "i")
    const locMatch = text.match(locRegex)
    if (locMatch && locMatch.index !== undefined) {
      ranges.push({ start: locMatch.index, end: locMatch.index + locMatch[0].length })
    }
  }

  // Sort and merge overlapping ranges
  ranges.sort((a, b) => a.start - b.start)
  const merged: typeof ranges = []
  for (const range of ranges) {
    const last = merged[merged.length - 1]
    if (last && range.start <= last.end) {
      last.end = Math.max(last.end, range.end)
    } else {
      merged.push({ ...range })
    }
  }

  // Build segments from merged ranges
  const segments: TextSegment[] = []
  let pos = 0
  for (const range of merged) {
    if (pos < range.start) {
      segments.push({ text: text.slice(pos, range.start), parsed: false })
    }
    segments.push({ text: text.slice(range.start, range.end), parsed: true })
    pos = range.end
  }
  if (pos < text.length) {
    segments.push({ text: text.slice(pos), parsed: false })
  }

  return segments
}

export function parseEventText(
  text: string,
  referenceDate: Date = new Date(),
): ParsedEventSegments {
  const recurrenceResult = parseRecurrence(text)

  const recurrence: Recurrence | null = recurrenceResult
    ? { rrule: recurrenceResult.rrule, exdates: [] }
    : null

  const textForChrono = recurrenceResult ? recurrenceResult.textForChrono : text

  const results = chrono.parse(textForChrono, referenceDate, { forwardDate: true })

  if (results.length === 0) {
    const { summary, location } = parseLocation(textForChrono.trim())
    return {
      summary,
      start: null,
      end: null,
      recurrence,
      location,
      chronoMatchText: null,
    }
  }

  const result = results[0]

  let summary = removeMatchAndConnectors(textForChrono, result.index, result.text)
  summary = summary.trim()

  const { summary: finalSummary, location } = parseLocation(summary)

  const allDay = !result.start.isCertain("hour")

  const startDate = allDay ? startOfDay(result.start.date()) : result.start.date()

  const endDate = allDay
    ? startOfDay(addDays(result.end ? result.end.date() : result.start.date(), 1))
    : result.end
      ? result.end.date()
      : addMinutes(startDate, DEFAULT_DURATION_MINS)

  // Convert to EventTime: all-day → PlainDate, timed → ZonedDateTime
  // anchored in the viewer's local zone (chrono produces local-zone Dates).
  const tzid = getLocalTzid()
  const toEt = (d: Date): EventTime =>
    allDay ? plainDate(d.getFullYear(), d.getMonth() + 1, d.getDate()) : fromDate(d, tzid)

  return {
    summary: finalSummary,
    start: toEt(startDate),
    end: toEt(endDate),
    recurrence,
    location,
    chronoMatchText: result.text,
  }
}
