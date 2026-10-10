import { RRule, RRuleSet, rrulestr } from "rrule"
import { describe, expect, it } from "vitest"

import {
  customRecurrenceFromRule,
  customRecurrenceToRule,
  describeRecurrence,
  toggleWeekday,
} from "./custom-recurrence"
import { recurrenceToRRuleSet, rruleToRecurrence } from "./rrule-utils"

const MON = 0
const TUE = 1
const THU = 3
const FRI = 4

const stored = (rule: RRule) => rruleToRecurrence(rule)!.rrule

describe("customRecurrenceToRule", () => {
  it("builds a Monday to Friday weekly series", () => {
    const rule = customRecurrenceToRule({
      freq: RRule.WEEKLY,
      interval: 1,
      weekdays: [FRI, MON, 2, THU, TUE],
    })
    expect(stored(rule)).toBe("FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR")
  })

  it("builds every n weeks", () => {
    const rule = customRecurrenceToRule({ freq: RRule.WEEKLY, interval: 3, weekdays: [MON] })
    expect(stored(rule)).toBe("FREQ=WEEKLY;INTERVAL=3")
  })

  it("combines an interval with several weekdays", () => {
    const rule = customRecurrenceToRule({ freq: RRule.WEEKLY, interval: 2, weekdays: [THU, TUE] })
    expect(stored(rule)).toBe("FREQ=WEEKLY;INTERVAL=2;BYDAY=TU,TH")
  })

  it("matches the presets for a lone weekday", () => {
    const rule = customRecurrenceToRule({ freq: RRule.WEEKLY, interval: 2, weekdays: [TUE] })
    expect(rule.toString()).toBe(new RRule({ freq: RRule.WEEKLY, interval: 2 }).toString())
  })

  it("ignores weekdays for non-weekly units", () => {
    const rule = customRecurrenceToRule({ freq: RRule.MONTHLY, interval: 2, weekdays: [MON, TUE] })
    expect(stored(rule)).toBe("FREQ=MONTHLY;INTERVAL=2")
  })

  it("keeps the end condition of the rule it replaces", () => {
    const previous = rrulestr("FREQ=WEEKLY;COUNT=10") as RRule
    const rule = customRecurrenceToRule(
      { freq: RRule.WEEKLY, interval: 1, weekdays: [MON, FRI] },
      previous,
    )
    expect(stored(rule)).toBe("FREQ=WEEKLY;BYDAY=MO,FR;COUNT=10")
  })
})

describe("customRecurrenceFromRule", () => {
  it("reads interval and weekdays from a stored rule", () => {
    const set = recurrenceToRRuleSet({
      rrule: "FREQ=WEEKLY;INTERVAL=3;BYDAY=MO,TU",
      exdates: [],
      rdates: [],
    })
    expect(customRecurrenceFromRule(set, MON)).toEqual({
      freq: RRule.WEEKLY,
      interval: 3,
      weekdays: [MON, TUE],
    })
  })

  it("always includes the event's own weekday", () => {
    expect(customRecurrenceFromRule(null, THU)).toEqual({
      freq: RRule.WEEKLY,
      interval: 1,
      weekdays: [THU],
    })
    expect(
      customRecurrenceFromRule(rrulestr("FREQ=WEEKLY;BYDAY=MO") as RRule, FRI).weekdays,
    ).toEqual([MON, FRI])
  })

  it("round-trips a stored rule unchanged", () => {
    for (const rrule of ["FREQ=WEEKLY;INTERVAL=2;BYDAY=TU,TH", "FREQ=DAILY;INTERVAL=5"]) {
      const parsed = rrulestr(rrule) as RRule
      expect(stored(customRecurrenceToRule(customRecurrenceFromRule(parsed, TUE), parsed))).toBe(
        rrule,
      )
    }
  })
})

describe("toggleWeekday", () => {
  it("adds and removes days but never the event's own day", () => {
    expect(toggleWeekday([MON], FRI, MON)).toEqual([MON, FRI])
    expect(toggleWeekday([MON, FRI], FRI, MON)).toEqual([MON])
    expect(toggleWeekday([MON, FRI], MON, MON)).toEqual([MON, FRI])
  })
})

describe("describeRecurrence", () => {
  it("labels custom rules", () => {
    expect(describeRecurrence(rrulestr("FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR") as RRule)).toBe(
      "Every weekday",
    )
    expect(describeRecurrence(rrulestr("FREQ=WEEKLY;INTERVAL=3") as RRule)).toBe("Every 3 weeks")
    const set = new RRuleSet()
    set.rrule(rrulestr("FREQ=WEEKLY;INTERVAL=2;BYDAY=TU,TH") as RRule)
    expect(describeRecurrence(set)).toBe("Every 2 weeks on Tuesday, Thursday")
  })
})
