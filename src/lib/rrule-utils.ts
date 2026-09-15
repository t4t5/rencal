import { Temporal } from "@js-temporal/polyfill"
import { RRule, RRuleSet, rrulestr } from "rrule"

import { type CalendarEvent, type Recurrence, withDates } from "./cal-events"
import {
  addDays,
  dateInEventZone,
  fromDate,
  getViewerTzid,
  toViewerZonedDateTime,
  type EventTime,
  wallclockTime,
} from "./event-time"

const MAX_EXDATE_SKIPS = 32

/** Project an event's wall-clock fields into the fake-UTC space rrule.js expects. */
function eventTimeToRRuleDate(eventTime: EventTime): Date {
  const date = dateInEventZone(eventTime)
  const time = wallclockTime(eventTime)
  return new Date(Date.UTC(date.year, date.month - 1, date.day, time.hour, time.minute))
}

/** Project a wallclock into the same fake-UTC space rrule.js expects. */
function localDateToRRuleDate(date: Temporal.PlainDateTime): Date {
  return new Date(
    Date.UTC(
      date.year,
      date.month - 1,
      date.day,
      date.hour,
      date.minute,
      date.second,
      date.millisecond,
    ),
  )
}

function rruleDateToPlainDate(date: Date): Temporal.PlainDate {
  return new Temporal.PlainDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate())
}

function nearestDateOnSide(
  dates: Date[],
  boundary: Date,
  direction: "after" | "before",
): Date | null {
  let nearest: Date | null = null

  for (const candidate of dates) {
    if (direction === "after") {
      if (candidate < boundary) continue
      if (!nearest || candidate < nearest) nearest = candidate
      continue
    }

    if (candidate > boundary) continue
    if (!nearest || candidate > nearest) nearest = candidate
  }

  return nearest
}

/**
 * Parse an RRULE string and create an RRule with the correct dtstart.
 *
 * rrule.js performs calendar math on Date's UTC fields, so callers must encode
 * wall-clock values with Date.UTC instead of passing a real local-time instant.
 *
 * rrulestr() has a bug where it initializes BY* fields to the current date/time
 * when they're not in the RRULE string. We only extract the recurrence-defining
 * fields and let dtstart control the actual occurrence dates.
 */
export function createRRuleWithDtstart(rruleString: string, dtstart: Date): RRule {
  const parsed = rrulestr(rruleString)

  return new RRule({
    freq: parsed.options.freq,
    interval: parsed.options.interval,
    count: parsed.options.count,
    until: parsed.options.until,
    wkst: parsed.options.wkst,
    byweekday: rruleString.includes("BYDAY") ? parsed.options.byweekday : undefined,
    bymonth: rruleString.includes("BYMONTH") ? parsed.options.bymonth : undefined,
    bymonthday: rruleString.includes("BYMONTHDAY") ? parsed.options.bymonthday : undefined,
    byhour: rruleString.includes("BYHOUR") ? parsed.options.byhour : undefined,
    byminute: rruleString.includes("BYMINUTE") ? parsed.options.byminute : undefined,
    dtstart,
  })
}

/** For a recurring master, shift start/end to the occurrence nearest to now. */
export function withNearestOccurrence(
  event: CalendarEvent,
  now: Temporal.PlainDateTime = Temporal.Now.zonedDateTimeISO(getViewerTzid()).toPlainDateTime(),
): CalendarEvent {
  if (!event.recurrence) return event

  try {
    const masterStart = eventTimeToRRuleDate(event.start)
    const rule = createRRuleWithDtstart(event.recurrence.rrule, masterStart)
    const exdateTimes = new Set(
      event.recurrence.exdates.map((exdate) => eventTimeToRRuleDate(exdate).getTime()),
    )
    const rdateOccurrences = event.recurrence.rdates
      .map(eventTimeToRRuleDate)
      .filter((rdate) => !exdateTimes.has(rdate.getTime()))
    const rruleNow = localDateToRRuleDate(now)
    const findIncludedOccurrence = (direction: "after" | "before"): Date | null => {
      let ruleOccurrence =
        direction === "after" ? rule.after(rruleNow, true) : rule.before(rruleNow, true)

      for (let i = 0; ruleOccurrence && i < MAX_EXDATE_SKIPS; i++) {
        if (!exdateTimes.has(ruleOccurrence.getTime())) break
        ruleOccurrence =
          direction === "after"
            ? rule.after(ruleOccurrence, false)
            : rule.before(ruleOccurrence, false)
      }
      if (ruleOccurrence && exdateTimes.has(ruleOccurrence.getTime())) ruleOccurrence = null

      const rdateOccurrence = nearestDateOnSide(rdateOccurrences, rruleNow, direction)

      if (!ruleOccurrence) return rdateOccurrence
      if (!rdateOccurrence) return ruleOccurrence
      if (direction === "after") {
        return ruleOccurrence < rdateOccurrence ? ruleOccurrence : rdateOccurrence
      }
      return ruleOccurrence > rdateOccurrence ? ruleOccurrence : rdateOccurrence
    }

    const occurrence = findIncludedOccurrence("after") ?? findIncludedOccurrence("before")
    if (!occurrence) return event

    const dayDelta = dateInEventZone(event.start).until(rruleDateToPlainDate(occurrence)).days
    return withDates(event, addDays(event.start, dayDelta), addDays(event.end, dayDelta))
  } catch {
    return event
  }
}

/**
 * Convert a Recurrence object into an RRuleSet.
 * rrule.js works with JS Date; we bridge each exception/addition's viewer-zone
 * wallclock into a local-components Date — the inverse of the fromDate bridge
 * in rruleToRecurrence, so the round trip through RRuleSet is lossless.
 */
export function recurrenceToRRuleSet(recurrence: Recurrence): RRuleSet {
  const rruleSet = new RRuleSet()
  rruleSet.rrule(rrulestr(recurrence.rrule) as RRule)
  for (const exdate of recurrence.exdates) {
    const z = toViewerZonedDateTime(exdate)
    rruleSet.exdate(new Date(z.year, z.month - 1, z.day, z.hour, z.minute, z.second, z.millisecond))
  }
  for (const rdate of recurrence.rdates) {
    const z = toViewerZonedDateTime(rdate)
    rruleSet.rdate(new Date(z.year, z.month - 1, z.day, z.hour, z.minute, z.second, z.millisecond))
  }
  return rruleSet
}

/**
 * Strip the "RRULE:" prefix that rrule.js adds, since caldir
 * expects just the value (e.g. "FREQ=WEEKLY;BYDAY=MO").
 */
function stripRRulePrefix(s: string): string {
  return s.replace(/^RRULE:/i, "")
}

/**
 * Convert an RRule or RRuleSet back to a Recurrence object.
 * Exception and addition dates from rrule.js are JS Dates; we wrap them as
 * zoned EventTime in the viewer's local zone.
 */
export function rruleToRecurrence(rrule: RRule | RRuleSet | null): Recurrence | null {
  if (!rrule) return null

  if (rrule instanceof RRuleSet) {
    const rrules = rrule.rrules()
    if (rrules.length === 0) return null

    const tzid = getViewerTzid()
    return {
      rrule: stripRRulePrefix(rrules[0].toString()),
      exdates: rrule.exdates().map((d) => fromDate(d, tzid)),
      rdates: rrule.rdates().map((d) => fromDate(d, tzid)),
    }
  }

  return {
    rrule: stripRRulePrefix(rrule.toString()),
    exdates: [],
    rdates: [],
  }
}
