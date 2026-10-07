import { Temporal } from "@js-temporal/polyfill"
import { afterAll, it, vi } from "vitest"

import type { RpcEventTime } from "@/rpc/bindings"

import { getStartRangeForDate, MONTHS_TO_LOAD } from "@/lib/cal-events-range"
import {
  addDays,
  addMinutes,
  atTime,
  computeEventDateInfo,
  coversFullDay,
  dateInEventZone,
  dateInViewerZone,
  dateKeyFromEpochDay,
  displayEndDate,
  epochDay,
  eventTzid,
  formatDateKey,
  formatDayMonth,
  formatLongDate,
  formatMonth,
  formatShortDate,
  formatTime,
  formatWallclockTime,
  formatWeekday,
  fromDate,
  getRelativeDayLabel,
  isAllDay,
  isoWeekNumber,
  isSameDay,
  isSameEventTime,
  normalizeAllDayRange,
  occupiedDays,
  plainDateFromEpochDay,
  shouldShowDisplayEndDate,
  startOfWeek,
  timeZoneCity,
  timeZoneOffsetLabel,
  toAllDay,
  toTimedAtStartOfDay,
  toViewerZonedDateTime,
  wallclockTime,
  withEventTimeZone,
  withRangeDisplayEndDate,
  withRangeEndWallclockTime,
  withRangeStartDate,
  withRangeStartWallclockTime,
  withRangeTimeZone,
  withRangeViewerZone,
  withViewerZone,
} from "@/lib/event-time"
import { withEventDate, withWallclockTime } from "@/lib/event-time/edit"
import { instantForOrdering } from "@/lib/event-time/projections"
import { fromRpcEventTime } from "@/lib/event-time/rpc"

import {
  capture,
  date,
  et,
  label,
  rpc,
  rpcRange,
  setNow,
  withViewer,
  writeFixture,
  type FixtureCase,
} from "./shared"

const CRATE = "rencal-time"

/** Viewer zones: no-DST, EU DST, US DST, half/quarter-hour offsets, southern hemisphere, 30-min DST. */
const VIEWERS = [
  "UTC",
  "Europe/Berlin",
  "Europe/London",
  "America/New_York",
  "America/Los_Angeles",
  "Asia/Kolkata",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Australia/Lord_Howe",
  "Pacific/Chatham",
  "America/Sao_Paulo",
]

/**
 * Event times covering every kind, DST gaps and overlaps in several zones,
 * midnight boundaries and leap days. 2026 transitions: EU 03-29 / 10-25 (01:00Z),
 * US 03-08 / 11-01, AU 04-05 / 10-04, Lord Howe 30-min shift.
 */
const TIMES: RpcEventTime[] = [
  et.date("2026-03-29"),
  et.date("2026-10-25"),
  et.date("2024-02-29"),
  et.date("2026-12-31"),
  et.date("2027-01-01"),
  et.utc("2026-03-29T00:30:00Z"),
  et.utc("2026-03-29T01:30:00Z"),
  et.utc("2026-10-25T00:30:00Z"),
  et.utc("2026-10-25T01:30:00Z"),
  et.utc("2026-11-01T05:30:00Z"),
  et.utc("2026-07-01T23:30:00Z"),
  et.utc("2026-06-15T00:00:00Z"),
  et.floating("2026-03-29T02:30:00"),
  et.floating("2026-03-29T01:30:00"),
  et.floating("2026-10-25T02:30:00"),
  et.floating("2026-10-25T01:30:00"),
  et.floating("2026-03-08T02:30:00"),
  et.floating("2026-11-01T01:30:00"),
  et.floating("2026-06-15T09:00:00"),
  et.floating("2026-06-15T00:00:00"),
  et.floating("2026-06-15T23:59:00"),
  et.zoned("2026-03-29T02:30:00", "Europe/Berlin"),
  et.zoned("2026-10-25T02:30:00", "Europe/Berlin"),
  et.zoned("2026-03-29T01:30:00", "Europe/London"),
  et.zoned("2026-10-25T01:30:00", "Europe/London"),
  et.zoned("2026-03-08T02:30:00", "America/New_York"),
  et.zoned("2026-11-01T01:30:00", "America/New_York"),
  et.zoned("2026-06-15T09:00:00", "Asia/Kolkata"),
  et.zoned("2026-01-01T00:00:00", "Pacific/Chatham"),
  et.zoned("2026-04-05T01:45:00", "Australia/Lord_Howe"),
  et.zoned("2026-10-04T02:15:00", "Australia/Lord_Howe"),
  et.zoned("2026-04-05T02:30:00", "Australia/Sydney"),
  et.zoned("2026-06-15T18:00:00", "America/Los_Angeles"),
  et.zoned("2026-06-15T00:00:00", "Europe/Berlin"),
  et.zoned("2026-12-31T23:30:00", "Asia/Tokyo"),
]

/** Start/end pairs for dateInfo and range edits. */
const RANGES: [RpcEventTime, RpcEventTime][] = [
  [et.date("2026-06-15"), et.date("2026-06-16")],
  [et.date("2026-06-15"), et.date("2026-06-18")],
  [et.date("2026-06-15"), et.date("2026-06-15")],
  [et.date("2026-06-15"), et.date("2026-06-14")],
  [et.date("2026-03-28"), et.date("2026-03-30")],
  [et.date("2026-12-30"), et.date("2027-01-02")],
  [
    et.zoned("2026-06-15T09:00:00", "Europe/Berlin"),
    et.zoned("2026-06-15T10:00:00", "Europe/Berlin"),
  ],
  [
    et.zoned("2026-06-15T23:00:00", "Europe/Berlin"),
    et.zoned("2026-06-16T00:00:00", "Europe/Berlin"),
  ],
  [
    et.zoned("2026-06-15T23:00:00", "Europe/Berlin"),
    et.zoned("2026-06-16T01:00:00", "Europe/Berlin"),
  ],
  [
    et.zoned("2026-06-15T00:00:00", "Europe/Berlin"),
    et.zoned("2026-06-17T00:00:00", "Europe/Berlin"),
  ],
  [
    et.zoned("2026-06-15T00:00:30", "Europe/Berlin"),
    et.zoned("2026-06-16T00:00:00", "Europe/Berlin"),
  ],
  [
    et.zoned("2026-06-15T22:00:00", "Europe/Berlin"),
    et.zoned("2026-06-17T03:00:00", "Europe/Berlin"),
  ],
  [
    et.zoned("2026-03-29T01:00:00", "Europe/Berlin"),
    et.zoned("2026-03-29T04:00:00", "Europe/Berlin"),
  ],
  [
    et.zoned("2026-10-25T01:30:00", "Europe/Berlin"),
    et.zoned("2026-10-25T02:30:00", "Europe/Berlin"),
  ],
  [
    et.zoned("2026-03-08T01:00:00", "America/New_York"),
    et.zoned("2026-03-08T03:30:00", "America/New_York"),
  ],
  [
    et.zoned("2026-11-01T00:30:00", "America/New_York"),
    et.zoned("2026-11-01T01:30:00", "America/New_York"),
  ],
  [
    et.zoned("2026-06-15T18:00:00", "America/Los_Angeles"),
    et.zoned("2026-06-15T19:30:00", "America/Los_Angeles"),
  ],
  [
    et.zoned("2026-06-15T09:00:00", "Asia/Kolkata"),
    et.zoned("2026-06-15T09:45:00", "Asia/Kolkata"),
  ],
  [et.utc("2026-06-15T08:00:00Z"), et.utc("2026-06-15T09:00:00Z")],
  [et.utc("2026-06-15T22:30:00Z"), et.utc("2026-06-16T00:30:00Z")],
  [et.utc("2026-10-25T00:30:00Z"), et.utc("2026-10-25T02:30:00Z")],
  [et.floating("2026-06-15T09:00:00"), et.floating("2026-06-15T10:30:00")],
  [et.floating("2026-03-29T01:30:00"), et.floating("2026-03-29T03:30:00")],
  [et.floating("2026-06-15T23:00:00"), et.floating("2026-06-16T00:00:00")],
  [
    et.zoned("2026-06-15T10:00:00", "Europe/Berlin"),
    et.zoned("2026-06-15T09:00:00", "Europe/Berlin"),
  ],
  [
    et.zoned("2026-06-15T09:00:00", "Europe/London"),
    et.zoned("2026-06-15T09:00:00", "Europe/London"),
  ],
]

const RANGE_VIEWERS = [
  "UTC",
  "Europe/Berlin",
  "America/New_York",
  "Asia/Kolkata",
  "Australia/Lord_Howe",
]

const NOW = "2026-04-20T08:00:00Z"

function eachViewerTime(
  viewers: string[],
  times: RpcEventTime[],
  fn: (t: RpcEventTime) => unknown,
): FixtureCase[] {
  const cases: FixtureCase[] = []
  for (const viewerTz of viewers) {
    for (const t of times) {
      cases.push({
        name: `${viewerTz} ${label(t)}`,
        input: { viewerTz, time: t },
        output: withViewer(viewerTz, () => capture(() => fn(t))),
      })
    }
  }
  return cases
}

afterAll(() => {
  vi.useRealTimers()
})

it("event time parsing", () => {
  writeFixture(CRATE, "parse", {
    source: "src/lib/event-time/rpc.ts",
    description:
      "fromRpcEventTime then toRpcEventTime. Zoned wallclocks in a DST gap resolve per Temporal 'compatible' (gap → later), overlaps → earlier. `offset` and `epochMs` are of the parsed value; `epochMs` for date/floating is in the viewer zone.",
    cases: eachViewerTime(["UTC", "Europe/Berlin", "America/New_York"], TIMES, (t) => {
      const parsed = fromRpcEventTime(t)
      return {
        normalized: rpc(parsed),
        offset: parsed.kind === "datetime_zoned" ? parsed.value.offset : null,
        epochMs: instantForOrdering(parsed).epochMilliseconds,
      }
    }),
  })
})

it("projections", () => {
  writeFixture(CRATE, "projections", {
    source: "src/lib/event-time/projections.ts",
    description:
      "Per viewer zone: ordering instant (epoch ms), viewer-zoned datetime (Temporal ZonedDateTime string), viewer-local date, isAllDay.",
    cases: eachViewerTime(VIEWERS, TIMES, (t) => {
      const v = fromRpcEventTime(t)
      return {
        instantMs: instantForOrdering(v).epochMilliseconds,
        viewerZoned: toViewerZonedDateTime(v).toString(),
        dateInViewerZone: dateInViewerZone(v).toString(),
        isAllDay: isAllDay(v),
      }
    }),
  })

  const pairs: FixtureCase[] = []
  const sample = TIMES.filter((_, i) => i % 3 === 0)
  for (const viewerTz of ["UTC", "Europe/Berlin", "America/New_York"]) {
    for (const a of sample) {
      for (const b of sample) {
        pairs.push({
          name: `${viewerTz} ${label(a)} vs ${label(b)}`,
          input: { viewerTz, a, b },
          output: withViewer(viewerTz, () => ({
            isSameDay: isSameDay(fromRpcEventTime(a), fromRpcEventTime(b)),
            isSameEventTime: isSameEventTime(fromRpcEventTime(a), fromRpcEventTime(b)),
          })),
        })
      }
    }
  }
  writeFixture(CRATE, "same", {
    source: "src/lib/event-time/projections.ts",
    description:
      "isSameDay (viewer-local date) and isSameEventTime (same kind and value, zone included).",
    cases: pairs,
  })
})

it("date info", () => {
  const cases: FixtureCase[] = []
  for (const viewerTz of VIEWERS) {
    for (const [start, end] of RANGES) {
      cases.push({
        name: `${viewerTz} ${label(start)} → ${label(end)}`,
        input: { viewerTz, start, end },
        output: withViewer(viewerTz, () => {
          const s = fromRpcEventTime(start)
          const info = computeEventDateInfo(s, fromRpcEventTime(end))
          const days = occupiedDays(info)
          return {
            dateInfo: info,
            occupiedDays: days,
            coversFullDay: days.map((day) => coversFullDay(s, info, day)),
          }
        }),
      })
    }
  }
  writeFixture(CRATE, "date_info", {
    source: "src/lib/event-time/layout.ts",
    description:
      "computeEventDateInfo (EventDateInfo; days are epoch-day integers, days since 1970-01-01), occupiedDays, and coversFullDay for each occupied day.",
    cases,
  })
})

it("calendar days", () => {
  const dates = [
    "1970-01-01",
    "1969-12-31",
    "2000-02-29",
    "2024-02-29",
    "2026-01-01",
    "2026-03-29",
    "2026-06-14",
    "2026-06-15",
    "2026-12-27",
    "2026-12-31",
    "2027-01-01",
    "2027-01-03",
    "2027-01-04",
    "2020-12-31",
    "2021-01-03",
    "1900-03-01",
    "2100-12-31",
  ]
  const cases: FixtureCase[] = dates.map((iso) => {
    const d = date(iso)
    const day = epochDay(d)
    return {
      name: iso,
      input: { date: iso },
      output: {
        epochDay: day,
        fromEpochDay: plainDateFromEpochDay(day).toString(),
        dateKeyFromEpochDay: dateKeyFromEpochDay(day),
        dayOfWeek: d.dayOfWeek,
        startOfWeek: {
          monday: startOfWeek(d, "monday").toString(),
          sunday: startOfWeek(d, "sunday").toString(),
        },
        isoWeekNumber: {
          monday: isoWeekNumber(d, "monday"),
          sunday: isoWeekNumber(d, "sunday"),
        },
      },
    }
  })
  writeFixture(CRATE, "days", {
    source: "src/lib/event-time/day.ts",
    description:
      "epochDay and its inverse, startOfWeek and isoWeekNumber for Monday- and Sunday-first weeks. dayOfWeek is ISO (Mon=1…Sun=7).",
    cases,
  })
})

it("display", () => {
  setNow(NOW)
  const cases: FixtureCase[] = []

  for (const t of TIMES) {
    for (const viewerTz of ["UTC", "Europe/Berlin", "America/New_York", "Asia/Kolkata"]) {
      cases.push({
        name: `formatTime ${viewerTz} ${label(t)}`,
        input: { fn: "formatTime", viewerTz, time: t },
        output: withViewer(viewerTz, () => ({
          "24h": formatTime(fromRpcEventTime(t), "24h"),
          "12h": formatTime(fromRpcEventTime(t), "12h"),
        })),
      })
      cases.push({
        name: `date labels ${viewerTz} ${label(t)}`,
        input: { fn: "dateLabels", viewerTz, time: t, now: NOW },
        output: withViewer(viewerTz, () => {
          const v = fromRpcEventTime(t)
          return {
            formatDateKey: formatDateKey(v),
            formatShortDate: formatShortDate(v),
            formatLongDate: formatLongDate(v),
            getRelativeDayLabel: getRelativeDayLabel(v),
          }
        }),
      })
    }
  }

  for (let hour = 0; hour < 24; hour++) {
    for (const minute of [0, 5, 30, 59]) {
      cases.push({
        name: `formatWallclockTime ${hour}:${minute}`,
        input: { fn: "formatWallclockTime", hour, minute },
        output: {
          "24h": formatWallclockTime(hour, minute, "24h"),
          "12h": formatWallclockTime(hour, minute, "12h"),
        },
      })
    }
  }

  // Relative labels and year suffixes around "today" (2026-04-20 in Berlin).
  const plainDates = [
    "2026-04-17",
    "2026-04-18",
    "2026-04-19",
    "2026-04-20",
    "2026-04-21",
    "2026-04-22",
    "2026-04-26",
    "2026-01-01",
    "2026-12-31",
    "2025-12-31",
    "2027-01-01",
    "2027-04-21",
  ]
  for (const viewerTz of ["Europe/Berlin", "Pacific/Chatham", "America/Los_Angeles"]) {
    for (const iso of plainDates) {
      cases.push({
        name: `plain date ${viewerTz} ${iso}`,
        input: { fn: "plainDateLabels", viewerTz, date: iso, now: NOW },
        output: withViewer(viewerTz, () => {
          const d = date(iso)
          return {
            formatDateKey: formatDateKey(d),
            formatShortDate: formatShortDate(d),
            formatLongDate: formatLongDate(d),
            formatDayMonth: formatDayMonth(d),
            getRelativeDayLabel: getRelativeDayLabel(d),
            weekday: { short: formatWeekday(d, "short"), long: formatWeekday(d, "long") },
            month: { short: formatMonth(d, "short"), long: formatMonth(d, "long") },
          }
        }),
      })
    }
  }
  vi.useRealTimers()

  writeFixture(CRATE, "display", {
    source: "src/lib/event-time/display.ts",
    description:
      "en-GB display strings. `now` is the fixed current instant (affects year suffixes and Today/Tomorrow/Yesterday). formatTime's 12h strings come from Intl en-US with 2-digit hours (\"02:00 AM\"); the separator before AM/PM is whatever Node's ICU emits (a plain space here; newer ICU/WebKit builds may emit U+202F). formatWallclockTime always uses a plain space and an unpadded hour.",
    cases,
  })
})

it("edits", () => {
  const cases: FixtureCase[] = []
  const viewers = ["UTC", "Europe/Berlin", "America/New_York", "Australia/Lord_Howe"]
  for (const viewerTz of viewers) {
    for (const t of TIMES) {
      cases.push({
        name: `${viewerTz} ${label(t)}`,
        input: { viewerTz, time: t },
        output: withViewer(viewerTz, () => {
          const v = fromRpcEventTime(t)
          return {
            addMinutes: Object.fromEntries(
              [-1440, -90, -30, 15, 60, 90, 720, 1440, 2880].map((m) => [
                String(m),
                capture(() => rpc(addMinutes(v, m))),
              ]),
            ),
            addDays: Object.fromEntries(
              [-7, -1, 1, 2, 7, 30].map((d) => [String(d), capture(() => rpc(addDays(v, d)))]),
            ),
            toAllDay: rpc(toAllDay(v)),
            toTimedAtStartOfDay: rpc(toTimedAtStartOfDay(v)),
            withViewerZone: rpc(withViewerZone(v)),
            dateInEventZone: dateInEventZone(v).toString(),
            wallclockTime: wallclockTime(v),
            withWallclockTime: Object.fromEntries(
              [
                [0, 0],
                [2, 30],
                [9, 15],
                [23, 45],
              ].map(([h, m]) => [`${h}:${m}`, capture(() => rpc(withWallclockTime(v, h, m)))]),
            ),
            withEventDate: Object.fromEntries(
              ["2026-03-29", "2026-10-25", "2026-03-08", "2026-11-01", "2024-02-29"].map((d) => [
                d,
                capture(() => rpc(withEventDate(v, date(d)))),
              ]),
            ),
            eventTzid: eventTzid(v),
            withEventTimeZone: Object.fromEntries(
              ["UTC", "Europe/Berlin", "America/New_York", "Asia/Kolkata"].map((z) => [
                z,
                capture(() => rpc(withEventTimeZone(v, z))),
              ]),
            ),
          }
        }),
      })
    }
  }
  writeFixture(CRATE, "edits", {
    source: "src/lib/event-time/edit.ts",
    description:
      "EventTime edits per viewer zone. Keys of addMinutes/addDays are the delta; withWallclockTime keys are hour:minute; withEventDate/withEventTimeZone keys are the argument. Outputs are RpcEventTime.",
    cases,
  })

  const atTimeCases: FixtureCase[] = []
  for (const viewerTz of viewers) {
    for (const [d, h, m] of [
      ["2026-06-15", 9, 0],
      ["2026-03-29", 2, 30],
      ["2026-03-29", 1, 30],
      ["2026-10-25", 2, 30],
      ["2026-10-25", 1, 30],
      ["2026-03-08", 2, 30],
      ["2026-11-01", 1, 30],
      ["2026-10-04", 2, 15],
      ["2026-04-05", 1, 45],
      ["2026-06-15", 0, 0],
      ["2026-06-15", 23, 59],
    ] as const) {
      atTimeCases.push({
        name: `atTime ${viewerTz} ${d} ${h}:${m}`,
        input: { fn: "atTime", viewerTz, date: d, hour: h, minute: m },
        output: withViewer(viewerTz, () => rpc(atTime(date(d), h, m))),
      })
    }
    for (const wall of [
      [2026, 3, 29, 2, 30],
      [2026, 10, 25, 2, 30],
      [2026, 6, 15, 9, 0],
    ] as const) {
      // fromDate reads the Date's local components; the process zone is Europe/Berlin.
      const [y, mo, d, h, mi] = wall
      const jsDate = new Date(y, mo - 1, d, h, mi)
      atTimeCases.push({
        name: `fromDate ${viewerTz} ${wall.join("-")}`,
        input: {
          fn: "fromDate",
          viewerTz,
          localComponents: {
            year: jsDate.getFullYear(),
            month: jsDate.getMonth() + 1,
            day: jsDate.getDate(),
            hour: jsDate.getHours(),
            minute: jsDate.getMinutes(),
          },
        },
        output: withViewer(viewerTz, () => rpc(fromDate(jsDate))),
      })
    }
  }
  writeFixture(CRATE, "constructors", {
    source: "src/lib/event-time/constructors.ts",
    description:
      "atTime builds a viewer-zoned datetime (DST gap → later, overlap → earlier). fromDate takes a Date's local wallclock components (as given in `localComponents`, after the Europe/Berlin process zone normalised them) and zones them in the viewer zone.",
    cases: atTimeCases,
  })
})

it("ranges", () => {
  const cases: FixtureCase[] = []
  for (const viewerTz of RANGE_VIEWERS) {
    for (const [start, end] of RANGES) {
      cases.push({
        name: `${viewerTz} ${label(start)} → ${label(end)}`,
        input: { viewerTz, start, end },
        output: withViewer(viewerTz, () => {
          const range = { start: fromRpcEventTime(start), end: fromRpcEventTime(end) }
          return {
            normalizeAllDayRange: capture(() =>
              rpcRange(normalizeAllDayRange(range.start, range.end)),
            ),
            withRangeStartWallclockTime: Object.fromEntries(
              [
                [8, 0],
                [2, 30],
                [23, 30],
              ].map(([h, m]) => [
                `${h}:${m}`,
                capture(() => rpcRange(withRangeStartWallclockTime(range, h, m))),
              ]),
            ),
            withRangeEndWallclockTime: Object.fromEntries(
              [
                [0, 0],
                [8, 0],
                [17, 45],
              ].map(([h, m]) => [
                `${h}:${m}`,
                capture(() => rpcRange(withRangeEndWallclockTime(range, h, m))),
              ]),
            ),
            withRangeStartDate: Object.fromEntries(
              ["2026-06-01", "2026-03-29", "2026-11-01", "2027-01-01"].map((d) => [
                d,
                capture(() => rpcRange(withRangeStartDate(range, date(d)))),
              ]),
            ),
            withRangeDisplayEndDate: Object.fromEntries(
              ["2026-06-10", "2026-06-15", "2026-06-20", "2026-10-25"].map((d) => [
                d,
                capture(() => rpcRange(withRangeDisplayEndDate(range, date(d)))),
              ]),
            ),
            displayEndDate: capture(() => displayEndDate(range).toString()),
            shouldShowDisplayEndDate: shouldShowDisplayEndDate(range),
            withRangeTimeZone: Object.fromEntries(
              ["UTC", "America/New_York", "Asia/Kolkata"].map((z) => [
                z,
                capture(() => rpcRange(withRangeTimeZone(range, z))),
              ]),
            ),
            withRangeViewerZone: rpcRange(withRangeViewerZone(range)),
          }
        }),
      })
    }
  }
  writeFixture(CRATE, "ranges", {
    source: "src/lib/event-time/range.ts",
    description:
      "EventTimeRange edits per viewer zone; keys of the edit maps are the argument (hour:minute, a date, or a zone). Outputs are { start, end } RpcEventTime.",
    cases,
  })
})

it("time zones", () => {
  const zones = [
    "Europe/Berlin",
    "America/New_York",
    "America/Argentina/Buenos_Aires",
    "America/Port_of_Spain",
    "Asia/Kolkata",
    "Asia/Kathmandu",
    "Pacific/Chatham",
    "Australia/Lord_Howe",
    "UTC",
    "Etc/GMT+5",
  ]
  const at = [
    et.utc("2026-01-15T12:00:00Z"),
    et.utc("2026-07-15T12:00:00Z"),
    et.zoned("2026-03-29T02:30:00", "Europe/Berlin"),
    et.zoned("2026-11-01T01:30:00", "America/New_York"),
    et.date("2026-07-01"),
    et.floating("2026-01-15T09:00:00"),
  ]
  const cases: FixtureCase[] = []
  for (const tzid of zones) {
    cases.push({
      name: `city ${tzid}`,
      input: { fn: "timeZoneCity", tzid },
      output: timeZoneCity(tzid),
    })
    for (const t of at) {
      cases.push({
        name: `offset ${tzid} at ${label(t)}`,
        input: { fn: "timeZoneOffsetLabel", viewerTz: "Europe/Berlin", tzid, at: t },
        output: withViewer("Europe/Berlin", () => timeZoneOffsetLabel(tzid, fromRpcEventTime(t))),
      })
    }
  }
  writeFixture(CRATE, "timezones", {
    source: "src/lib/event-time/timezones.ts",
    description:
      "timeZoneCity and timeZoneOffsetLabel (offset of `tzid` at the instant of `at`; date/floating values are anchored in viewerTz). listTimeZones depends on the JS engine's ICU data and is not captured.",
    cases,
  })
})

it("load ranges", () => {
  const cases: FixtureCase[] = [
    "2026-01-15",
    "2026-03-01",
    "2026-06-30",
    "2026-11-20",
    "2026-12-31",
    "2024-02-29",
  ].map((iso) => {
    const range = getStartRangeForDate(Temporal.PlainDate.from(iso))
    return {
      name: iso,
      input: { date: iso },
      output: {
        start: range.start.toString(),
        end: range.end.toString(),
        monthsToLoad: MONTHS_TO_LOAD,
      },
    }
  })
  writeFixture(CRATE, "load_ranges", {
    source: "src/lib/cal-events-range.ts",
    description: "getStartRangeForDate: the initial [start, end) date range loaded around a date.",
    cases,
  })
})
