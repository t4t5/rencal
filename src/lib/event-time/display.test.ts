import { Temporal } from "@js-temporal/polyfill"
import { i18n } from "@lingui/core"
import { msg } from "@lingui/core/macro"
import { afterEach, describe, expect, it } from "vitest"

import { today } from "./constructors"
import {
  formatDayMonth,
  formatLongDate,
  formatMonth,
  formatMonthYear,
  formatShortDate,
  formatWeekday,
  getRelativeDayLabel,
  setDisplayLocale,
  weekdayNames,
} from "./display"

// 28 April 2030 is a Sunday, and never "this year" while the tests run.
const SUNDAY = Temporal.PlainDate.from("2030-04-28")

afterEach(() => {
  setDisplayLocale("en-GB")
  i18n.activate("en")
})

describe("display locale: English default", () => {
  it("names weekdays and months", () => {
    expect(formatWeekday(SUNDAY, "short")).toBe("Sun")
    expect(formatMonth(SUNDAY, "long")).toBe("April")
  })

  it("formats dates with the year outside the current year", () => {
    expect(formatShortDate(SUNDAY)).toBe("Sun, 28 Apr 2030")
    expect(formatLongDate(SUNDAY)).toBe("Sunday, 28 April 2030")
    expect(formatDayMonth(SUNDAY)).toBe("28 Apr 2030")
    expect(formatMonthYear(SUNDAY)).toBe("April 2030")
  })

  it("leaves the year out within the current year", () => {
    expect(formatDayMonth(today().with({ month: 4, day: 28 }))).toBe("28 Apr")
  })

  it("lists weekday names Monday first", () => {
    expect(weekdayNames("short")).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"])
  })

  it("labels nearby days relative to today", () => {
    expect(getRelativeDayLabel(today())).toBe("Today")
    expect(getRelativeDayLabel(today().add({ days: 1 }))).toBe("Tomorrow")
    expect(getRelativeDayLabel(today().subtract({ days: 1 }))).toBe("Yesterday")
  })
})

describe("display locale: German", () => {
  it("follows the display locale for names and date patterns", () => {
    setDisplayLocale("de-DE")
    expect(formatWeekday(SUNDAY, "long")).toBe("Sonntag")
    expect(formatShortDate(SUNDAY)).toBe("So., 28. Apr. 2030")
    expect(formatLongDate(SUNDAY)).toBe("Sonntag, 28. April 2030")
    expect(formatDayMonth(SUNDAY)).toBe("28. Apr. 2030")
    expect(weekdayNames("short")[0]).toBe("Mo")
  })

  it("keeps regional month names", () => {
    setDisplayLocale("de-AT")
    expect(formatMonth(Temporal.PlainDate.from("2030-01-05"), "long")).toBe("Jänner")
  })

  it("translates relative day labels through the active catalog", () => {
    i18n.loadAndActivate({ locale: "de", messages: { [msg`Today`.id]: "Heute" } })
    expect(getRelativeDayLabel(today())).toBe("Heute")
  })

  it("ignores an unknown locale tag and keeps the previous one", () => {
    setDisplayLocale("de-DE")
    setDisplayLocale("not a locale!")
    expect(formatWeekday(SUNDAY, "long")).toBe("Sonntag")
  })
})
