import { i18n } from "@lingui/core"
import { RRule } from "rrule"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { setDisplayLocale } from "@/lib/event-time"

import { loadCatalog } from "@/locales/load-catalog"

import { describeRecurrence } from "./recurrence-text"

const rule = (options: ConstructorParameters<typeof RRule>[0]) => new RRule(options)

describe("describeRecurrence (English source text)", () => {
  it.each([
    [{ freq: RRule.DAILY, interval: 3 }, "Every 3 days"],
    [{ freq: RRule.YEARLY, interval: 3 }, "Every 3 years"],
    [
      { freq: RRule.WEEKLY, byweekday: [RRule.MO, RRule.WE, RRule.FR] },
      "Every week on Monday, Wednesday and Friday",
    ],
    [{ freq: RRule.WEEKLY, interval: 2, byweekday: [RRule.TU] }, "Every 2 weeks on Tuesday"],
    [
      { freq: RRule.WEEKLY, byweekday: [RRule.MO, RRule.TU, RRule.WE, RRule.TH, RRule.FR] },
      "Every weekday",
    ],
    [{ freq: RRule.MONTHLY, byweekday: [RRule.TU.nth(2)] }, "Every month on the 2nd Tuesday"],
    [{ freq: RRule.MONTHLY, byweekday: [RRule.FR.nth(-1)] }, "Every month on the last Friday"],
    [{ freq: RRule.MONTHLY, bymonthday: [15] }, "Every month on the 15th"],
    [{ freq: RRule.MONTHLY, bymonthday: [1, 2] }, "Every month on the 1st and 2nd"],
    [{ freq: RRule.DAILY, count: 10 }, "Every day, 10 times"],
    [{ freq: RRule.WEEKLY, until: new Date(Date.UTC(2030, 0, 5)) }, "Every week until 5 Jan 2030"],
  ])("%o → %s", (options, expected) => {
    expect(describeRecurrence(rule(options))).toBe(expected)
  })

  it.each([
    [{ freq: RRule.HOURLY }],
    [{ freq: RRule.MONTHLY, byweekday: [RRule.MO], bysetpos: [1] }],
    [{ freq: RRule.YEARLY, bymonth: [3, 6] }],
  ])("leaves rules it cannot describe exactly to the caller: %o", (options) => {
    expect(describeRecurrence(rule(options))).toBeNull()
  })
})

describe("describeRecurrence (German catalog)", () => {
  beforeAll(async () => {
    i18n.loadAndActivate({ locale: "de", messages: await loadCatalog("de") })
    setDisplayLocale("de-DE")
  })
  afterAll(() => {
    i18n.activate("en")
    setDisplayLocale("en-GB")
  })

  it.each([
    [{ freq: RRule.WEEKLY, interval: 2, byweekday: [RRule.TU] }, "Alle 2 Wochen am Dienstag"],
    [{ freq: RRule.WEEKLY, byweekday: [RRule.MO, RRule.FR] }, "Jede Woche am Montag und Freitag"],
    [{ freq: RRule.MONTHLY, byweekday: [RRule.TU.nth(2)] }, "Jeden Monat am 2. Dienstag"],
    [{ freq: RRule.MONTHLY, byweekday: [RRule.FR.nth(-1)] }, "Jeden Monat am letzten Freitag"],
    [{ freq: RRule.DAILY, count: 10 }, "Jeden Tag, 10 Mal"],
    [{ freq: RRule.WEEKLY, until: new Date(Date.UTC(2030, 0, 5)) }, "Jede Woche bis 5. Jan. 2030"],
  ])("%o → %s", (options, expected) => {
    expect(describeRecurrence(rule(options))).toBe(expected)
  })
})
