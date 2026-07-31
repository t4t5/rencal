import { RRule, RRuleSet, rrulestr } from "rrule"

import { type CalendarEvent, type Recurrence, withDates } from "./cal-events"
import {
  addDays,
  formatDateKey,
  fromDate,
  getLocalTzid,
  localDateToPlainDate,
  toInteropDate,
} from "./event-time"

const MAX_EXDATE_SKIPS = 32

/**
 * Parse an RRULE string and create an RRule with the correct dtstart.
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
export function withNearestOccurrence(event: CalendarEvent, now = new Date()): CalendarEvent {
  if (!event.recurrence) return event

  try {
    const masterStart = toInteropDate(event.start)
    const rule = createRRuleWithDtstart(event.recurrence.rrule, masterStart)
    const exdateKeys = new Set(event.recurrence.exdates.map(formatDateKey))
    const findIncludedOccurrence = (direction: "after" | "before"): Date | null => {
      let occurrence = direction === "after" ? rule.after(now, true) : rule.before(now, true)

      for (let i = 0; occurrence && i < MAX_EXDATE_SKIPS; i++) {
        if (!exdateKeys.has(formatDateKey(occurrence))) return occurrence
        occurrence =
          direction === "after" ? rule.after(occurrence, false) : rule.before(occurrence, false)
      }

      return null
    }

    const occurrence = findIncludedOccurrence("after") ?? findIncludedOccurrence("before")
    if (!occurrence) return event

    const dayDelta = localDateToPlainDate(masterStart).until(localDateToPlainDate(occurrence)).days
    return withDates(event, addDays(event.start, dayDelta), addDays(event.end, dayDelta))
  } catch {
    return event
  }
}

/**
 * Convert a Recurrence object into an RRuleSet.
 * rrule.js works with JS Date; we project EventTime to an interop Date for
 * the bridge.
 */
export function recurrenceToRRuleSet(recurrence: Recurrence): RRuleSet {
  const rruleSet = new RRuleSet()
  rruleSet.rrule(rrulestr(recurrence.rrule) as RRule)
  for (const exdate of recurrence.exdates) {
    rruleSet.exdate(toInteropDate(exdate))
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
 * Exdates from rrule.js are JS Dates; we wrap them as zoned EventTime in
 * the viewer's local zone.
 */
export function rruleToRecurrence(rrule: RRule | RRuleSet | null): Recurrence | null {
  if (!rrule) return null

  if (rrule instanceof RRuleSet) {
    const rrules = rrule.rrules()
    if (rrules.length === 0) return null

    const tzid = getLocalTzid()
    return {
      rrule: stripRRulePrefix(rrules[0].toString()),
      exdates: rrule.exdates().map((d) => fromDate(d, tzid)),
    }
  }

  return {
    rrule: stripRRulePrefix(rrule.toString()),
    exdates: [],
  }
}
