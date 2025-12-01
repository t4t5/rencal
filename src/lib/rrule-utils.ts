import { RRule, rrulestr } from "rrule"

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
