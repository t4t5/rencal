import { Temporal } from "@js-temporal/polyfill"
import { RRule, RRuleSet, rrulestr } from "rrule"
import { describe, expect, it } from "vitest"

import {
  type CustomRecurrence,
  customRecurrenceFromRule,
  customRecurrenceToRule,
  describeRecurrence,
  isEditableRecurrence,
  toggleWeekday,
} from "./custom-recurrence"
import type { EventTime } from "./event-time"
import { fromRpcEventTime } from "./event-time/rpc"
import { recurrenceToRRuleSet, rruleToRecurrence } from "./rrule-utils"

const MON = 0
const TUE = 1
const THU = 3
const FRI = 4

// 2026-10-12 is a Monday, 2026-10-15 a Thursday.
const date = (value: string): EventTime => fromRpcEventTime({ kind: "date", date: value })
const monday = date("2026-10-12")
const thursday = date("2026-10-15")
const zoned = (value: string): EventTime => ({
  kind: "datetime_zoned",
  value: Temporal.ZonedDateTime.from(value),
})
const floating = (value: string): EventTime => ({
  kind: "datetime_floating",
  value: Temporal.PlainDateTime.from(value),
})

const parse = (rrule: string) => rrulestr(rrule) as RRule
const stored = (rule: RRule, start: EventTime = monday) => rruleToRecurrence(rule, start)!.rrule

const weekly = (overrides: Partial<CustomRecurrence> = {}): CustomRecurrence => ({
  freq: RRule.WEEKLY,
  interval: 1,
  weekdays: [MON],
  end: { kind: "never" },
  ...overrides,
})

describe("customRecurrenceToRule", () => {
  it("builds a Monday to Friday weekly series", () => {
    const rule = customRecurrenceToRule(weekly({ weekdays: [FRI, MON, 2, THU, TUE] }), monday)
    expect(stored(rule)).toBe("FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR")
  })

  it("builds every n weeks", () => {
    expect(stored(customRecurrenceToRule(weekly({ interval: 3 }), monday))).toBe(
      "FREQ=WEEKLY;INTERVAL=3;BYDAY=MO",
    )
  })

  it("combines an interval with several weekdays", () => {
    const rule = customRecurrenceToRule(weekly({ interval: 2, weekdays: [THU, TUE] }), monday)
    expect(stored(rule)).toBe("FREQ=WEEKLY;INTERVAL=2;BYDAY=TU,TH")
  })

  it("ignores weekdays for non-weekly units", () => {
    const rule = customRecurrenceToRule(
      weekly({ freq: RRule.MONTHLY, interval: 2, weekdays: [MON, TUE] }),
      monday,
    )
    expect(stored(rule)).toBe("FREQ=MONTHLY;INTERVAL=2")
  })

  it("ends after a number of occurrences", () => {
    const rule = customRecurrenceToRule(weekly({ end: { kind: "after", count: 10 } }), monday)
    expect(stored(rule)).toBe("FREQ=WEEKLY;BYDAY=MO;COUNT=10")
  })

  it("ends on a date, in the UNTIL form the event's kind needs", () => {
    const end = { kind: "on", date: Temporal.PlainDate.from("2026-11-14") } as const
    const build = (start: EventTime) =>
      stored(customRecurrenceToRule(weekly({ end }), start), start)

    expect(build(monday)).toBe("FREQ=WEEKLY;BYDAY=MO;UNTIL=20261114")
    expect(build(floating("2026-10-12T09:00"))).toBe("FREQ=WEEKLY;BYDAY=MO;UNTIL=20261114T235959")
    // End of Nov 14 in Stockholm (UTC+1) is 22:59:59 UTC.
    expect(build(zoned("2026-10-12T09:00[Europe/Stockholm]"))).toBe(
      "FREQ=WEEKLY;BYDAY=MO;UNTIL=20261114T225959Z",
    )
  })

  it("keeps an unchanged end date's exact UNTIL", () => {
    // A split's UNTIL lands one second before the next series' first occurrence.
    const start = zoned("2026-10-12T09:00[Europe/Stockholm]")
    const previous = parse("FREQ=WEEKLY;UNTIL=20261116T075959Z")
    const recurrence = customRecurrenceFromRule(previous, start)
    expect(recurrence.end).toEqual({ kind: "on", date: Temporal.PlainDate.from("2026-11-15") })

    const rule = customRecurrenceToRule({ ...recurrence, weekdays: [MON, FRI] }, start, previous)
    expect(stored(rule, start)).toBe("FREQ=WEEKLY;BYDAY=MO,FR;UNTIL=20261116T075959Z")
  })

  it("keeps the week start of the rule it replaces", () => {
    const previous = parse("FREQ=WEEKLY;WKST=SU")
    expect(stored(customRecurrenceToRule(weekly(), monday, previous))).toBe(
      "FREQ=WEEKLY;BYDAY=MO;WKST=SU",
    )
  })
})

describe("customRecurrenceFromRule", () => {
  it("reads interval and weekdays from a stored rule", () => {
    const set = recurrenceToRRuleSet({
      rrule: "FREQ=WEEKLY;INTERVAL=3;BYDAY=MO,TU",
      exdates: [],
      rdates: [],
    })
    expect(customRecurrenceFromRule(set, monday)).toEqual(
      weekly({ interval: 3, weekdays: [MON, TUE] }),
    )
  })

  it("starts from the event's own weekday when the rule names none", () => {
    expect(customRecurrenceFromRule(null, thursday)).toEqual(weekly({ weekdays: [THU] }))
    expect(customRecurrenceFromRule(parse("FREQ=WEEKLY;INTERVAL=2"), thursday).weekdays).toEqual([
      THU,
    ])
  })

  it("doesn't add the event's own weekday to a rule that names others", () => {
    const rule = parse("FREQ=WEEKLY;BYDAY=MO,TU,WE,FR")
    expect(customRecurrenceFromRule(rule, thursday).weekdays).toEqual([MON, TUE, 2, FRI])
  })

  it("reads the end condition", () => {
    expect(customRecurrenceFromRule(parse("FREQ=DAILY;COUNT=4"), monday).end).toEqual({
      kind: "after",
      count: 4,
    })
    expect(customRecurrenceFromRule(parse("FREQ=DAILY;UNTIL=20261114"), monday).end).toEqual({
      kind: "on",
      date: Temporal.PlainDate.from("2026-11-14"),
    })
  })

  it("round-trips a stored rule unchanged", () => {
    for (const rrule of [
      "FREQ=WEEKLY;INTERVAL=2;BYDAY=TU,TH",
      "FREQ=DAILY;INTERVAL=5",
      "FREQ=WEEKLY;BYDAY=MO;COUNT=3",
      "FREQ=WEEKLY;BYDAY=MO;UNTIL=20261114",
    ]) {
      const parsed = parse(rrule)
      const rule = customRecurrenceToRule(customRecurrenceFromRule(parsed, monday), monday, parsed)
      expect(stored(rule)).toBe(rrule)
    }
  })
})

describe("isEditableRecurrence", () => {
  it("accepts rules the editor can show", () => {
    expect(isEditableRecurrence(null)).toBe(true)
    for (const rrule of [
      "FREQ=DAILY",
      "FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,TH;WKST=SU",
      "FREQ=MONTHLY;COUNT=3",
      "FREQ=YEARLY;UNTIL=20301231",
    ]) {
      expect(isEditableRecurrence(parse(rrule))).toBe(true)
    }
    expect(
      isEditableRecurrence(
        recurrenceToRRuleSet({ rrule: "FREQ=WEEKLY", exdates: [monday], rdates: [] }),
      ),
    ).toBe(true)
  })

  it("rejects rules it would change", () => {
    for (const rrule of [
      "FREQ=MONTHLY;BYDAY=2TU",
      "FREQ=MONTHLY;BYMONTHDAY=-1",
      "FREQ=YEARLY;BYMONTH=11;BYDAY=4TH",
      "FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1",
      "FREQ=DAILY;BYDAY=MO,TU",
      "FREQ=HOURLY",
    ]) {
      expect(isEditableRecurrence(parse(rrule)), rrule).toBe(false)
    }
  })
})

describe("toggleWeekday", () => {
  it("adds and removes any day but keeps at least one", () => {
    expect(toggleWeekday([MON], FRI)).toEqual([MON, FRI])
    expect(toggleWeekday([MON, FRI], MON)).toEqual([FRI])
    expect(toggleWeekday([FRI], FRI)).toEqual([FRI])
  })
})

describe("describeRecurrence", () => {
  it("labels custom rules", () => {
    expect(describeRecurrence(parse("FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR"), monday)).toBe(
      "Every weekday",
    )
    expect(describeRecurrence(parse("FREQ=WEEKLY;INTERVAL=3"), monday)).toBe("Every 3 weeks")
    const set = new RRuleSet()
    set.rrule(parse("FREQ=WEEKLY;INTERVAL=2;BYDAY=TU,TH"))
    expect(describeRecurrence(set, monday)).toBe("Every 2 weeks on Tuesday, Thursday")
  })

  it("names the series' last day, not UNTIL's UTC date", () => {
    // End of Nov 14 in New York is Nov 15 in UTC.
    const start = zoned("2026-10-12T09:00[America/New_York]")
    expect(describeRecurrence(parse("FREQ=DAILY;UNTIL=20261115T045959Z"), start)).toBe(
      "Every day until November 14, 2026",
    )
  })
})
