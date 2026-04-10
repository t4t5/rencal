import * as chrono from "chrono-node"
import { addMinutes, startOfDay } from "date-fns"

const DEFAULT_DURATION_MINUTES = 30

interface ParsedEventText {
  summary: string
  start: Date | null
  end: Date | null
  allDay: boolean
}

function removeMatchAndConnectors(text: string, matchIndex: number, matchText: string): string {
  const before = text.slice(0, matchIndex)
  const after = text.slice(matchIndex + matchText.length)

  const cleanedBefore = before.replace(/\b(at|on|for|from)\s*$/i, "")

  return (cleanedBefore + after).replace(/\s{2,}/g, " ")
}

export function parseEventText(text: string, referenceDate: Date = new Date()): ParsedEventText {
  const results = chrono.parse(text, referenceDate, { forwardDate: true })

  if (results.length === 0) {
    return { summary: text.trim(), start: null, end: null, allDay: false }
  }

  const result = results[0]

  let summary = removeMatchAndConnectors(text, result.index, result.text)
  summary = summary.trim()

  const allDay = !result.start.isCertain("hour")

  const start = allDay ? startOfDay(result.start.date()) : result.start.date()

  const end = result.end
    ? result.end.date()
    : allDay
      ? startOfDay(result.start.date())
      : addMinutes(start, DEFAULT_DURATION_MINUTES)

  return { summary, start, end, allDay }
}
