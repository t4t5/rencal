import type { Calendar } from "@/lib/api"
import { describe, expect, it } from "@/lib/testing/vitest"

import { accountRows } from "./accounts/AccountsPage"
import { joinNames } from "./agents/AgentsPage"
import { isSupportedCalendarUrl } from "./calendars/AddSubscriptionModal"
import { toggledGroups } from "./calendars/CalendarsColumn"
import { groupNameError } from "./calendars/GroupsColumn"

const calendar = (provider: string | null, account: string | null) =>
  ({ slug: `${provider}-${account}`, provider, account }) as Calendar

describe("accountRows", () => {
  it("makes a row per provider account, counting its calendars", () => {
    const rows = accountRows([
      calendar("google", "a@b.c"),
      calendar("google", "a@b.c"),
      calendar("icloud", "a@b.c"),
      calendar(null, null),
    ])
    expect(rows.map((row) => [row.key, row.calendarCount])).toEqual([
      ["google/a@b.c", 2],
      ["icloud/a@b.c", 1],
    ])
  })
})

describe("toggledGroups", () => {
  const all = ["a", "b"]

  it("leaves the default group out while it holds every calendar", () => {
    expect(toggledGroups({}, "default", all, "a", false)).toEqual({ default: ["b"] })
    expect(toggledGroups({ default: ["b"] }, "default", all, "a", true)).toEqual({})
  })

  it("keeps a named group's list", () => {
    expect(toggledGroups({ work: ["a"] }, "work", all, "b", true)).toEqual({ work: ["a", "b"] })
  })
})

describe("groupNameError", () => {
  it("reserves the default group and refuses duplicates", () => {
    expect(groupNameError("default", [])).toBe("Default is reserved.")
    expect(groupNameError("work", ["work"])).toBe("A group with this name already exists.")
    expect(groupNameError("home", ["work"])).toBeNull()
  })
})

describe("isSupportedCalendarUrl", () => {
  it("takes webcal and http feeds only", () => {
    expect(isSupportedCalendarUrl("webcal://example.com/a.ics")).toBe(true)
    expect(isSupportedCalendarUrl("https://example.com/a.ics")).toBe(true)
    expect(isSupportedCalendarUrl("ftp://example.com/a.ics")).toBe(false)
    expect(isSupportedCalendarUrl("not a url")).toBe(false)
  })
})

describe("joinNames", () => {
  it("lists names", () => {
    expect(joinNames(["Claude"])).toBe("Claude")
    expect(joinNames(["a", "b", "c"])).toBe("a, b and c")
  })
})
