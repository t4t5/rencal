import { RRule, RRuleSet, rrulestr } from "rrule"

import type { Recurrence } from "./cal-events"
import { fromDate, getLocalTzid, toJsDate } from "./event-time"

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

/**
 * Convert a Recurrence object into an RRuleSet.
 * rrule.js works with JS Date; we project EventDateTime to its UTC instant for
 * the bridge.
 */
export function recurrenceToRRuleSet(recurrence: Recurrence): RRuleSet {
  const rruleSet = new RRuleSet()
  rruleSet.rrule(rrulestr(recurrence.rrule) as RRule)
  for (const exdate of recurrence.exdates) {
    rruleSet.exdate(toJsDate(exdate))
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
 * Exdates from rrule.js are JS Dates; we wrap them as zoned EventDateTime in
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
