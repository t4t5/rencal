import { RRule, RRuleSet, rrulestr } from "rrule"

import type { Recurrence } from "@/rpc/bindings"

/**
 * Parse an RRULE string and create an RRule with the correct dtstart.
 *
 * rrulestr() has a bug where it initializes BY* fields to the current date/time
 * when they're not in the RRULE string. We only extract the recurrence-defining
 * fields and let dtstart control the actual occurrence dates.
 */
export function createRRuleWithDtstart(rruleString: string, dtstart: Date): RRule {
  const parsed = rrulestr(rruleString)

  // Only take recurrence-defining options, NOT the BY* fields that rrulestr
  // incorrectly initializes to the current date
  return new RRule({
    freq: parsed.options.freq,
    interval: parsed.options.interval,
    count: parsed.options.count,
    until: parsed.options.until,
    wkst: parsed.options.wkst,
    // Only include byweekday if it was explicitly in the RRULE (for things like "every Monday")
    byweekday: rruleString.includes("BYDAY") ? parsed.options.byweekday : undefined,
    // Only include bymonth if explicitly set (for things like "every March")
    bymonth: rruleString.includes("BYMONTH") ? parsed.options.bymonth : undefined,
    // Only include bymonthday if explicitly set
    bymonthday: rruleString.includes("BYMONTHDAY") ? parsed.options.bymonthday : undefined,
    // Only include byhour if explicitly set
    byhour: rruleString.includes("BYHOUR") ? parsed.options.byhour : undefined,
    // Only include byminute if explicitly set
    byminute: rruleString.includes("BYMINUTE") ? parsed.options.byminute : undefined,
    // dtstart controls the base date for recurrence
    dtstart,
  })
}

/**
 * Convert a Recurrence object (from caldir) into an RRuleSet.
 */
export function recurrenceToRRuleSet(recurrence: Recurrence): RRuleSet {
  const rruleSet = new RRuleSet()
  rruleSet.rrule(rrulestr(recurrence.rrule) as RRule)
  for (const exdate of recurrence.exdates) {
    rruleSet.exdate(new Date(exdate))
  }
  return rruleSet
}

/**
 * Convert an RRule or RRuleSet back to a Recurrence object.
 */
export function rruleToRecurrence(rrule: RRule | RRuleSet | null): Recurrence | null {
  if (!rrule) return null

  if (rrule instanceof RRuleSet) {
    const rrules = rrule.rrules()
    if (rrules.length === 0) return null

    return {
      rrule: rrules[0].toString(),
      exdates: rrule.exdates().map((d) => d.toISOString()),
    }
  }

  return {
    rrule: rrule.toString(),
    exdates: [],
  }
}
