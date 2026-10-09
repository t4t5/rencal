import { Temporal } from "@js-temporal/polyfill"
import type { ParsedComponents, ParsedResult } from "chrono-node"

import type { Recurrence } from "@/lib/cal-events"
import {
  addMinutes,
  allDayDate,
  DEFAULT_DURATION_MINS,
  fromDate,
  getViewerTzid,
  type EventTime,
} from "@/lib/event-time"
import { jsDateToPlainDate } from "@/lib/event-time/js-date"
import { GERMAN } from "@/lib/magic-parser/vocabularies/de"
import { ENGLISH } from "@/lib/magic-parser/vocabularies/en"
import type { ParserVocabulary } from "@/lib/magic-parser/vocabulary"

function currentViewerWallclockDate(): Date {
  const now = Temporal.Now.zonedDateTimeISO(getViewerTzid())
  return new Date(
    now.year,
    now.month - 1,
    now.day,
    now.hour,
    now.minute,
    now.second,
    now.millisecond,
  )
}

interface ParsedEventSegments {
  summary: string
  start: EventTime | null
  end: EventTime | null
  recurrence: Recurrence | null
  location: string | null
  // Raw chrono match text from the input. Used by segmentEventText to locate
  // the time range in the original text without re-running chrono.
  chronoMatchText: string | null
  // A time found further on and merged into a time-less day ("Heute … um 19 Uhr").
  timeMatchText: string | null
}

interface RecurrenceResult {
  rrule: string
  textForChrono: string
  index: number
  length: number
}

/** The leftmost recurrence phrase of the vocabulary, if any. */
function parseRecurrence(text: string, vocabulary: ParserVocabulary): RecurrenceResult | null {
  let best: { match: RegExpMatchArray; rrule: string; keepGroup?: number } | null = null
  for (const phrase of vocabulary.recurrences) {
    const match = text.match(phrase.pattern)
    if (match?.index === undefined) continue
    if (!best || match.index < best.match.index!) best = { match, ...phrase }
  }
  if (!best) return null

  const { match, rrule, keepGroup } = best
  const index = match.index!
  // Keep a weekday in the text so chrono can resolve the start date; drop the rest.
  const kept = keepGroup ? match[keepGroup].toLowerCase() : ""
  const textForChrono = (text.slice(0, index) + kept + text.slice(index + match[0].length))
    .replace(/\s{2,}/g, " ")
    .trim()

  return { rrule, textForChrono, index, length: match[0].length }
}

function parseLocation(
  summary: string,
  vocabulary: ParserVocabulary,
): { summary: string; location: string | null } {
  const match = summary.match(vocabulary.location)
  if (!match || !match[1].trim()) return { summary, location: null }

  const location = match[1].trim()
  const cleaned = summary.slice(0, match.index).trim()

  return { summary: cleaned, location }
}

function removeMatchAndConnectors(
  text: string,
  matchIndex: number,
  matchText: string,
  vocabulary: ParserVocabulary,
): string {
  const before = text.slice(0, matchIndex)
  const after = text.slice(matchIndex + matchText.length)

  const cleanedBefore = before.replace(vocabulary.connectorsBeforeDate, "")

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
export function segmentEventText(
  text: string,
  referenceDate: Date = currentViewerWallclockDate(),
  vocabularies: readonly ParserVocabulary[] = activeVocabularies(),
): TextSegment[] {
  if (!text.trim()) return [{ text, parsed: false }]

  const { parsed, vocabulary } = parseBest(text, referenceDate, vocabularies)

  if (!parsed.start && !parsed.recurrence && !parsed.location) {
    return [{ text, parsed: false }]
  }

  const ranges: Array<{ start: number; end: number }> = []

  // Recurrence range
  const recMatch = parseRecurrence(text, vocabulary)
  if (recMatch) {
    ranges.push({ start: recMatch.index, end: recMatch.index + recMatch.length })
  }

  // Time range — locate the chrono match in the original text. We use indexOf
  // instead of re-running chrono.parse here to keep typing responsive.
  if (parsed.start && parsed.chronoMatchText) {
    const searchFrom = recMatch ? recMatch.index + recMatch.length : 0
    const idx = text.indexOf(parsed.chronoMatchText, searchFrom)
    if (idx >= 0) {
      ranges.push({ start: idx, end: idx + parsed.chronoMatchText.length })
    }
  }
  if (parsed.timeMatchText) {
    const idx = text.lastIndexOf(parsed.timeMatchText)
    if (idx >= 0) ranges.push({ start: idx, end: idx + parsed.timeMatchText.length })
  }

  // Location range: its last occurrence (a merged time may still follow it)
  if (parsed.location) {
    const idx = text.lastIndexOf(parsed.location)
    if (idx >= 0) ranges.push({ start: idx, end: idx + parsed.location.length })
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
  referenceDate: Date = currentViewerWallclockDate(),
  vocabularies: readonly ParserVocabulary[] = activeVocabularies(),
): ParsedEventSegments {
  return parseBest(text, referenceDate, vocabularies).parsed
}

/**
 * Parses with every vocabulary and keeps the reading that recognises the most
 * text (date plus recurrence); on a tie the earlier vocabulary wins. That lets
 * the user's language go first while English input keeps working.
 */
function parseBest(
  text: string,
  referenceDate: Date,
  vocabularies: readonly ParserVocabulary[],
): { parsed: ParsedEventSegments; vocabulary: ParserVocabulary } {
  let best: { parsed: ParsedEventSegments; vocabulary: ParserVocabulary; score: number } | null =
    null
  for (const vocabulary of vocabularies) {
    const { parsed, recognised } = parseWith(text, referenceDate, vocabulary)
    if (!best || recognised > best.score) best = { parsed, vocabulary, score: recognised }
  }
  if (!best) throw new Error("parseEventText needs at least one vocabulary")
  return best
}

function parseWith(
  text: string,
  referenceDate: Date,
  vocabulary: ParserVocabulary,
): { parsed: ParsedEventSegments; recognised: number } {
  const recurrenceResult = parseRecurrence(text, vocabulary)
  const recurrenceLength = recurrenceResult?.length ?? 0

  const recurrence: Recurrence | null = recurrenceResult
    ? { rrule: recurrenceResult.rrule, exdates: [], rdates: [] }
    : null

  const textForChrono = recurrenceResult ? recurrenceResult.textForChrono : text

  const results = vocabulary.chrono.parse(textForChrono, referenceDate, { forwardDate: true })

  if (results.length === 0) {
    const { summary, location } = parseLocation(textForChrono.trim(), vocabulary)
    return {
      parsed: {
        summary,
        start: null,
        end: null,
        recurrence,
        location,
        chronoMatchText: null,
        timeMatchText: null,
      },
      recognised: recurrenceLength,
    }
  }

  const result = results[0]
  const time = findSeparateTime(result, results.slice(1))

  let summary = textForChrono
  if (time) summary = removeMatchAndConnectors(summary, time.index, time.text, vocabulary)
  summary = removeMatchAndConnectors(summary, result.index, result.text, vocabulary).trim()

  const { summary: finalSummary, location } = parseLocation(summary, vocabulary)

  const allDay = !time && !result.start.isCertain("hour")
  const tzid = getViewerTzid()

  let start: EventTime, end: EventTime
  if (allDay) {
    const startDate = jsDateToPlainDate(result.start.date())
    const endDate = (result.end ? jsDateToPlainDate(result.end.date()) : startDate).add({ days: 1 })
    start = allDayDate(startDate)
    end = allDayDate(endDate)
  } else if (time) {
    start = fromDate(onDayOf(result.start.date(), time.start), tzid)
    end = time.end
      ? fromDate(onDayOf(result.start.date(), time.end), tzid)
      : addMinutes(start, DEFAULT_DURATION_MINS)
  } else {
    start = fromDate(result.start.date(), tzid)
    end = result.end ? fromDate(result.end.date(), tzid) : addMinutes(start, DEFAULT_DURATION_MINS)
  }

  return {
    parsed: {
      summary: finalSummary,
      start,
      end,
      recurrence,
      location,
      chronoMatchText: result.text,
      timeMatchText: time?.text ?? null,
    },
    recognised: recurrenceLength + result.text.length + (time?.text.length ?? 0),
  }
}

/**
 * chrono reads "Heute essen im Nanami um 19 Uhr" as two results: a day without
 * a time, then a time without a day. Returns that later time so both can be
 * merged; null when the first result already has a time.
 */
function findSeparateTime(first: ParsedResult, rest: ParsedResult[]): ParsedResult | null {
  if (first.start.isCertain("hour")) return null
  return (
    rest.find(
      (r) =>
        r.start.isCertain("hour") &&
        !r.start.isCertain("day") &&
        !r.start.isCertain("weekday") &&
        !r.start.isCertain("month"),
    ) ?? null
  )
}

/** The calendar day of `day` at the wall-clock time of `time`. */
function onDayOf(day: Date, time: ParsedComponents): Date {
  const merged = new Date(day)
  merged.setHours(time.get("hour") ?? 0, time.get("minute") ?? 0, 0, 0)
  return merged
}

const VOCABULARIES: readonly ParserVocabulary[] = [ENGLISH, GERMAN]

/** The vocabularies to try for a UI language: that language first, English after it. */
export function vocabulariesFor(language: string): readonly ParserVocabulary[] {
  const own = VOCABULARIES.find((v) => v.language === language)
  return own && own !== ENGLISH ? [own, ENGLISH] : [ENGLISH]
}

let activeLanguageVocabularies = vocabulariesFor("en")

/** Called when the UI locale is activated (see src/lib/i18n). */
export function setParserLanguage(language: string): void {
  activeLanguageVocabularies = vocabulariesFor(language)
}

function activeVocabularies(): readonly ParserVocabulary[] {
  return activeLanguageVocabularies
}
