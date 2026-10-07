// @vitest-environment happy-dom
// (useMonthGrid's module imports the settings context, which touches `window`.)
import { Temporal } from "@js-temporal/polyfill"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { it } from "vitest"

import {
  allDayBarStyle,
  LANE_GAP,
  reservedAllDayHeight,
} from "@/components/main/month-view/lane-geometry"
import {
  classifyGesture,
  decayRate,
  pickFlingTarget,
  pickSnapTarget,
  predictFlingEnd,
} from "@/components/main/month-view/weekSnapFling"

import {
  assignAllDayLanes,
  clipSpanToRange,
  type AllDayLaneItem,
} from "@/hooks/cal-events/all-day-lanes"
import { useDayRangeLayout } from "@/hooks/cal-events/useDayRangeLayout"
import { useMonthEventLayout } from "@/hooks/cal-events/useMonthEventLayout"
import { buildDay, monthGridBounds, type MonthDay } from "@/hooks/cal-events/useMonthGrid"
import type { Calendar } from "@/lib/api"
import type { CalendarEvent } from "@/lib/cal-events"
import {
  clampPointToRect,
  daySelectionForPointer,
  daySelectionRange,
  minutesAtY,
  selectionForPointer,
  selectionRange,
} from "@/lib/drag-to-create"
import {
  AUTOSCROLL_EDGE_PX,
  computeDropRange,
  DRAG_SNAP_MINUTES,
  DRAG_THRESHOLD_PX,
  edgeScrollDelta,
  grabFor,
  makeDragPreview,
  type DropHit,
  type DropZone,
} from "@/lib/event-drag"
import type { FirstDayOfWeek } from "@/lib/event-time"
import { isSpanning } from "@/lib/event-utils"

import {
  date,
  et,
  makeEvent,
  rpcRange,
  withViewer,
  writeFixture,
  type EventSpec,
  type FixtureCase,
} from "./shared"

const CRATE = "rencal-layout"
const TODAY = "2026-06-17"

const CALENDARS: Calendar[] = [
  { slug: "cal", name: "Cal", color: "#ff0000", provider: null, account: null, read_only: null },
  { slug: "work", name: "Work", color: null, provider: null, account: null, read_only: null },
]

/** Call a hook outside a component tree by rendering a throwaway component. */
function runHook<T>(hook: () => T): T {
  let result: T | undefined
  function Probe() {
    result = hook()
    return null
  }
  renderToStaticMarkup(createElement(Probe))
  return result as T
}

const B = "Europe/Berlin"
const z = (wallclock: string, tzid = B) => et.zoned(wallclock, tzid)
const timed = (
  id: string,
  day: string,
  from: string,
  to: string,
  extra: Partial<EventSpec> = {},
): EventSpec => ({
  id,
  start: z(`${day}T${from}:00`),
  end: z(`${day}T${to}:00`),
  ...extra,
})
const allDay = (id: string, from: string, toExclusive: string): EventSpec => ({
  id,
  start: et.date(from),
  end: et.date(toExclusive),
})

function daysFrom(start: string, count: number): MonthDay[] {
  const first = date(start)
  return Array.from({ length: count }, (_, i) => buildDay(first.add({ days: i }), date(TODAY)))
}

const allDayOut = (items: AllDayLaneItem[]) =>
  items.map((item) => ({
    eventId: item.event.id,
    startCol: item.startCol,
    endCol: item.endCol,
    isStart: item.isStart,
    isEnd: item.isEnd,
    lane: item.lane,
  }))

/** Scenarios for the week/day time grid and the month grid. */
const EVENT_SETS: Record<string, EventSpec[]> = {
  empty: [],
  single: [timed("a", "2026-06-15", "09:00", "10:00")],
  "side by side": [
    timed("a", "2026-06-15", "09:00", "10:00"),
    timed("b", "2026-06-15", "09:30", "10:30"),
  ],
  "back to back": [
    timed("a", "2026-06-15", "09:00", "10:00"),
    timed("b", "2026-06-15", "10:00", "11:00"),
  ],
  "same start, longer first": [
    timed("short", "2026-06-15", "09:00", "09:30"),
    timed("long", "2026-06-15", "09:00", "12:00"),
    timed("mid", "2026-06-15", "09:00", "10:00"),
  ],
  "transitive chain": [
    timed("a", "2026-06-15", "09:00", "10:00"),
    timed("b", "2026-06-15", "09:45", "11:00"),
    timed("c", "2026-06-15", "10:30", "12:00"),
    timed("d", "2026-06-15", "11:30", "12:30"),
    timed("e", "2026-06-15", "13:00", "14:00"),
  ],
  "column reuse": [
    timed("a", "2026-06-16", "08:00", "12:00"),
    timed("b", "2026-06-16", "08:30", "09:00"),
    timed("c", "2026-06-16", "09:00", "09:30"),
    timed("d", "2026-06-16", "09:15", "10:00"),
    timed("e", "2026-06-16", "11:00", "13:00"),
  ],
  "zero and short durations": [
    timed("zero", "2026-06-17", "09:00", "09:00"),
    timed("15m", "2026-06-17", "09:00", "09:15"),
    timed("44m", "2026-06-17", "10:00", "10:44"),
    timed("45m", "2026-06-17", "11:00", "11:45"),
    timed("59m", "2026-06-17", "12:00", "12:59"),
    timed("60m", "2026-06-17", "13:00", "14:00"),
    timed("74m", "2026-06-17", "15:00", "16:14"),
    timed("75m", "2026-06-17", "17:00", "18:15"),
  ],
  "ends at midnight": [
    { id: "late", start: z("2026-06-18T22:00:00"), end: z("2026-06-19T00:00:00") },
    { id: "full", start: z("2026-06-18T00:00:00"), end: z("2026-06-19T00:00:00") },
  ],
  "crosses midnight": [
    { id: "overnight", start: z("2026-06-18T22:00:00"), end: z("2026-06-19T02:00:00") },
    { id: "multi", start: z("2026-06-16T09:00:00"), end: z("2026-06-19T17:00:00") },
  ],
  "all-day mix": [
    allDay("one", "2026-06-15", "2026-06-16"),
    allDay("three", "2026-06-16", "2026-06-19"),
    allDay("week", "2026-06-15", "2026-06-22"),
    allDay("before", "2026-06-10", "2026-06-17"),
    allDay("after", "2026-06-20", "2026-06-25"),
    allDay("outside", "2026-06-01", "2026-06-03"),
    allDay("degenerate", "2026-06-18", "2026-06-18"),
    timed("t", "2026-06-17", "10:00", "11:00"),
  ],
  "other zones": [
    {
      id: "ny",
      start: z("2026-06-15T18:00:00", "America/New_York"),
      end: z("2026-06-15T19:00:00", "America/New_York"),
    },
    {
      id: "tokyo",
      start: z("2026-06-16T08:00:00", "Asia/Tokyo"),
      end: z("2026-06-16T09:30:00", "Asia/Tokyo"),
    },
    { id: "utc", start: et.utc("2026-06-17T21:30:00Z"), end: et.utc("2026-06-17T22:30:00Z") },
    {
      id: "float",
      start: et.floating("2026-06-18T07:00:00"),
      end: et.floating("2026-06-18T07:30:00"),
    },
  ],
  "outside range": [
    timed("before", "2026-06-14", "09:00", "10:00"),
    timed("after", "2026-06-22", "09:00", "10:00"),
    timed("inside", "2026-06-21", "09:00", "10:00", { calendar_slug: "work" }),
    timed("unknown calendar", "2026-06-21", "09:30", "10:00", { calendar_slug: "missing" }),
  ],
  "dense day": Array.from({ length: 12 }, (_, i) =>
    timed(
      `e${i}`,
      "2026-06-19",
      `${String(8 + (i % 5)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`,
      `${String(9 + (i % 4)).padStart(2, "0")}:${i % 3 ? "15" : "45"}`,
    ),
  ),
}

const DST_SETS: Record<string, EventSpec[]> = {
  "spring forward day": [
    { id: "gap", start: z("2026-03-29T01:30:00"), end: z("2026-03-29T03:30:00") },
    { id: "after", start: z("2026-03-29T03:00:00"), end: z("2026-03-29T04:00:00") },
  ],
  "fall back day": [
    { id: "overlap", start: z("2026-10-25T01:30:00"), end: z("2026-10-25T03:30:00") },
    { id: "after", start: z("2026-10-25T02:00:00"), end: z("2026-10-25T03:00:00") },
  ],
}

function weekLayoutCase(
  name: string,
  viewerTz: string,
  start: string,
  count: number,
  specs: EventSpec[],
): FixtureCase {
  return {
    name,
    input: { viewerTz, today: TODAY, days: { start, count }, calendars: CALENDARS, events: specs },
    output: withViewer(viewerTz, () => {
      const days = daysFrom(start, count)
      const events = specs.map(makeEvent)
      const layout = runHook(() => useDayRangeLayout(days, events, CALENDARS))
      return {
        allDayItems: allDayOut(layout.allDayItems),
        maxAllDayLane: layout.maxAllDayLane,
        timedByDay: Object.fromEntries(
          [...layout.timedByDay.entries()].map(([key, items]) => [
            key,
            items.map((item) => ({
              eventId: item.event.id,
              top: item.top,
              height: item.height,
              column: item.column,
              totalColumns: item.totalColumns,
              durationMinutes: item.durationMinutes,
              displayMode: item.displayMode,
            })),
          ]),
        ),
      }
    }),
  }
}

it("week layout", () => {
  const cases: FixtureCase[] = []
  for (const [setName, specs] of Object.entries(EVENT_SETS)) {
    cases.push(weekLayoutCase(`week ${setName}`, B, "2026-06-15", 7, specs))
    cases.push(weekLayoutCase(`3 days ${setName}`, B, "2026-06-16", 3, specs))
  }
  cases.push(
    weekLayoutCase(
      "week other zones in New York",
      "America/New_York",
      "2026-06-15",
      7,
      EVENT_SETS["other zones"],
    ),
  )
  cases.push(
    weekLayoutCase(
      "week other zones in Tokyo",
      "Asia/Tokyo",
      "2026-06-15",
      7,
      EVENT_SETS["other zones"],
    ),
  )
  cases.push(weekLayoutCase("no days", B, "2026-06-15", 0, EVENT_SETS.single))
  cases.push(weekLayoutCase("single day", B, "2026-06-15", 1, EVENT_SETS["transitive chain"]))
  cases.push(weekLayoutCase("spring forward", B, "2026-03-29", 1, DST_SETS["spring forward day"]))
  cases.push(weekLayoutCase("fall back", B, "2026-10-25", 1, DST_SETS["fall back day"]))
  writeFixture(CRATE, "week_layout", {
    source: ["src/hooks/cal-events/useDayRangeLayout.ts", "src/hooks/cal-events/all-day-lanes.ts"],
    description:
      "Week/day time-grid layout. `top`/`height` are percentages of a 24h column. Arrays are in the order the TS code leaves them (all-day items sorted by span desc then start col; timed items by top then height desc). `days` is `count` consecutive days from `start`. calendarColor is omitted (it is `calendar.color ?? primary` wrapped in a CSS var).",
    cases,
  })
})

function monthWeeks(rangeStart: string, rangeEnd: string, firstDay: FirstDayOfWeek): MonthDay[][] {
  // Mirrors the loop in useMonthGrid (which needs the settings context).
  const { gridStart, gridEnd } = monthGridBounds(date(rangeStart), date(rangeEnd), firstDay)
  const weeks: MonthDay[][] = []
  let current = gridStart
  while (Temporal.PlainDate.compare(current, gridEnd) < 0) {
    const week: MonthDay[] = []
    for (let d = 0; d < 7; d++) week.push(buildDay(current.add({ days: d }), date(TODAY)))
    weeks.push(week)
    current = current.add({ days: 7 })
  }
  return weeks
}

it("month grid", () => {
  const cases: FixtureCase[] = []
  for (const [start, end] of [
    ["2026-06-01", "2026-07-01"],
    ["2026-02-01", "2026-03-01"],
    ["2026-03-01", "2026-04-01"],
    ["2026-11-01", "2027-01-01"],
    ["2027-02-01", "2027-03-01"],
  ]) {
    for (const firstDay of ["monday", "sunday"] as const) {
      const { gridStart, gridEnd } = monthGridBounds(date(start), date(end), firstDay)
      cases.push({
        name: `${start}..${end} ${firstDay}`,
        input: { rangeStart: start, rangeEnd: end, firstDayOfWeek: firstDay, today: TODAY },
        output: {
          gridStart: gridStart.toString(),
          gridEnd: gridEnd.toString(),
          weeks: monthWeeks(start, end, firstDay).map((week) =>
            week.map((d) => ({ dateKey: d.dateKey, isToday: d.isToday, isWeekend: d.isWeekend })),
          ),
        },
      })
    }
  }
  writeFixture(CRATE, "month_grid", {
    source: "src/hooks/cal-events/useMonthGrid.ts",
    description:
      "monthGridBounds and the weeks covering [rangeStart, rangeEnd) (loop mirrored from useMonthGrid).",
    cases,
  })
})

it("month layout", () => {
  const cases: FixtureCase[] = []
  const sets = {
    ...EVENT_SETS,
    ...{
      "month spans": [
        allDay("long", "2026-06-03", "2026-06-20"),
        allDay("wrap", "2026-06-06", "2026-06-09"),
        allDay("a", "2026-06-08", "2026-06-10"),
        allDay("b", "2026-06-09", "2026-06-11"),
        allDay("c", "2026-06-10", "2026-06-12"),
        { id: "overnight", start: z("2026-06-07T22:00:00"), end: z("2026-06-08T01:00:00") },
        timed("t1", "2026-06-09", "14:00", "15:00"),
        timed("t0", "2026-06-09", "08:00", "09:00"),
        { id: "t-utc", start: et.utc("2026-06-09T05:00:00Z"), end: et.utc("2026-06-09T06:00:00Z") },
      ],
    },
  }
  for (const [setName, specs] of Object.entries(sets)) {
    for (const firstDay of ["monday", "sunday"] as const) {
      cases.push({
        name: `${setName} ${firstDay}`,
        input: {
          viewerTz: B,
          today: TODAY,
          rangeStart: "2026-06-01",
          rangeEnd: "2026-07-01",
          firstDayOfWeek: firstDay,
          calendars: CALENDARS,
          events: specs,
        },
        output: withViewer(B, () => {
          const weeks = monthWeeks("2026-06-01", "2026-07-01", firstDay)
          const events = specs.map(makeEvent)
          const layout = runHook(() => useMonthEventLayout(weeks, events, CALENDARS))
          return layout.map((week, i) => ({
            weekStart: weeks[i][0].dateKey,
            allDayItems: allDayOut(week.allDayItems),
            maxLane: week.maxLane,
            timedByCol: week.timedByCol.map((col) => col.map((item) => item.event.id)),
          }))
        }),
      })
    }
  }
  writeFixture(CRATE, "month_layout", {
    source: [
      "src/hooks/cal-events/useMonthEventLayout.ts",
      "src/hooks/cal-events/all-day-lanes.ts",
    ],
    description:
      "Month view layout per week row: spanning items (all-day or crossing a day boundary) with lanes, and single-day timed event ids per column sorted by start instant (stable for ties).",
    cases,
  })
})

it("all-day lanes", () => {
  const cases: FixtureCase[] = []
  for (const [first, last, rFirst, rLast] of [
    [10, 10, 10, 16],
    [8, 12, 10, 16],
    [14, 20, 10, 16],
    [8, 20, 10, 16],
    [2, 5, 10, 16],
    [17, 20, 10, 16],
    [16, 16, 10, 16],
    [10, 9, 10, 16],
  ]) {
    cases.push({
      name: `clip ${first}-${last} to ${rFirst}-${rLast}`,
      input: {
        fn: "clipSpanToRange",
        firstDay: first,
        lastDay: last,
        rangeFirstDay: rFirst,
        rangeLastDay: rLast,
      },
      output: clipSpanToRange(first, last, rFirst, rLast),
    })
  }
  const spanSets: Record<string, [number, number][]> = {
    "nested and staggered": [
      [1, 8],
      [2, 4],
      [3, 5],
      [5, 7],
      [1, 2],
      [7, 8],
    ],
    "equal spans keep start order": [
      [3, 4],
      [1, 2],
      [2, 3],
      [1, 2],
    ],
    "full stack": [
      [1, 8],
      [1, 8],
      [1, 8],
    ],
    "fill gaps": [
      [1, 3],
      [4, 6],
      [2, 5],
      [6, 8],
      [1, 2],
    ],
  }
  for (const [name, spans] of Object.entries(spanSets)) {
    const items = spans.map(([startCol, endCol], index) => ({
      index,
      startCol,
      endCol,
      isStart: true,
      isEnd: true,
      lane: 0,
    }))
    const maxLane = assignAllDayLanes(items, 7)
    cases.push({
      name: `assign ${name}`,
      input: {
        fn: "assignAllDayLanes",
        columnCount: 7,
        spans: spans.map(([startCol, endCol]) => ({ startCol, endCol })),
      },
      output: { maxLane, order: items.map(({ index, lane }) => ({ index, lane })) },
    })
  }
  writeFixture(CRATE, "all_day_lanes", {
    source: "src/hooks/cal-events/all-day-lanes.ts",
    description:
      "clipSpanToRange (1-based start col, exclusive end col) and assignAllDayLanes. `order` lists input indexes in the sorted order the function leaves the items (Array.prototype.sort is stable), with their lane.",
    cases,
  })

  writeFixture(CRATE, "lane_geometry", {
    source: "src/components/main/month-view/lane-geometry.ts",
    description:
      "Month all-day bar CSS geometry (CSS calc strings: bars inset by --month-padding-inline at real ends, bleed -2px at clipped ends). LANE_GAP is in px.",
    cases: [
      { name: "lane gap", input: { fn: "LANE_GAP" }, output: LANE_GAP },
      ...[
        { startCol: 1, endCol: 8, isStart: true, isEnd: true },
        { startCol: 3, endCol: 5, isStart: false, isEnd: true },
        { startCol: 6, endCol: 8, isStart: true, isEnd: false },
      ].flatMap((span) =>
        [0, 2].map((lane) => ({
          name: `bar ${span.startCol}-${span.endCol} ${span.isStart}/${span.isEnd} lane ${lane}`,
          input: { fn: "allDayBarStyle", span, lane },
          output: allDayBarStyle(span, lane),
        })),
      ),
      ...[0, 1, 3].map((lanes) => ({
        name: `reserved ${lanes}`,
        input: { fn: "reservedAllDayHeight", lanes },
        output: reservedAllDayHeight(lanes),
      })),
    ],
  })
})

it("drag to reschedule", () => {
  const cases: FixtureCase[] = []
  const events: EventSpec[] = [
    timed("morning", "2026-06-16", "09:00", "10:30"),
    timed("late", "2026-06-16", "22:30", "23:45"),
    { id: "to-midnight", start: z("2026-06-16T23:00:00"), end: z("2026-06-17T00:00:00") },
    { id: "overnight", start: z("2026-06-16T22:00:00"), end: z("2026-06-17T02:00:00") },
    allDay("allday", "2026-06-16", "2026-06-17"),
    allDay("multi", "2026-06-16", "2026-06-19"),
    {
      id: "ny",
      start: z("2026-06-16T03:00:00", "America/New_York"),
      end: z("2026-06-16T04:00:00", "America/New_York"),
    },
    { id: "utc", start: et.utc("2026-06-16T07:00:00Z"), end: et.utc("2026-06-16T08:00:00Z") },
    {
      id: "float",
      start: et.floating("2026-06-16T12:00:00"),
      end: et.floating("2026-06-16T12:20:00"),
    },
    { id: "pre-dst", start: z("2026-03-28T01:30:00"), end: z("2026-03-28T02:30:00") },
  ]
  const hits: DropHit[] = []
  const zones: DropZone[] = ["day", "all-day", "timed"]
  for (const zone of zones) {
    for (const day of ["2026-06-16", "2026-06-18", "2026-06-14", "2026-03-29"]) {
      for (const minutes of zone === "timed" ? [0, 7, 545, 548, 1380, 1439] : [null]) {
        hits.push({ zone, day: date(day), minutes })
      }
    }
  }
  const hitJson = (hit: DropHit) => ({
    zone: hit.zone,
    day: hit.day.toString(),
    minutes: hit.minutes,
  })
  const grabHits: (DropHit | null)[] = [
    null,
    { zone: "timed", day: date("2026-06-16"), minutes: 600 },
    { zone: "day", day: date("2026-06-17"), minutes: null },
  ]

  for (const spec of events) {
    withViewer(B, () => {
      const event = makeEvent(spec)
      for (const grabHit of grabHits) {
        const grab = grabFor(event, grabHit)
        const drops: Record<string, unknown> = {}
        for (const hit of hits) {
          const range = computeDropRange(event, hit, grab)
          drops[`${hit.zone} ${hit.day} ${hit.minutes}`] = range && rpcRange(range)
        }
        cases.push({
          name: `${spec.id} grab ${grabHit ? `${grabHit.zone} ${grabHit.day} ${grabHit.minutes}` : "none"}`,
          input: {
            fn: "computeDropRange",
            viewerTz: B,
            event: spec,
            grabHit: grabHit && hitJson(grabHit),
            hits: hits.map(hitJson),
          },
          output: {
            grab,
            isSpanning: isSpanning(event),
            previewId: makeDragPreview(event, { start: event.start, end: event.end }).id,
            drops,
          },
        })
      }
    })
  }

  const rect = { left: 100, top: 50, right: 500, bottom: 650 }
  for (const x of [0, 51, 52, 60, 100, 120, 147, 148, 149, 300, 452, 480, 500, 548, 549]) {
    for (const y of [1, 50, 98, 99, 300, 640, 699]) {
      for (const axes of [
        { x: true, y: true },
        { x: false, y: true },
      ]) {
        cases.push({
          name: `edgeScroll ${x},${y} ${axes.x ? "xy" : "y"}`,
          input: { fn: "edgeScrollDelta", rect, x, y, axes },
          output: edgeScrollDelta(rect, x, y, axes),
        })
      }
    }
  }
  cases.push({
    name: "constants",
    input: { fn: "constants" },
    output: { DRAG_SNAP_MINUTES, DRAG_THRESHOLD_PX, AUTOSCROLL_EDGE_PX },
  })

  writeFixture(CRATE, "event_drag", {
    source: "src/lib/event-drag.ts",
    description:
      'Drag-to-reschedule math. A case grabs `event` at `grabHit` (null = no hit) via grabFor, then runs computeDropRange for every hit in `hits`; `drops` is keyed "<zone> <day> <minutes>" and holds null when the drop is refused or a no-op, else the new { start, end } range. `previewId` is the id makeDragPreview gives the stand-in. Also edgeScrollDelta and the constants.',
    cases,
  })
})

it("drag to create", () => {
  const cases: FixtureCase[] = []
  for (const [a, p] of [
    ["2026-06-16", "2026-06-16"],
    ["2026-06-16", "2026-06-19"],
    ["2026-06-16", "2026-06-12"],
    ["2026-12-30", "2027-01-02"],
  ]) {
    const sel = daySelectionForPointer(date(a), date(p))
    cases.push({
      name: `days ${a} → ${p}`,
      input: { fn: "daySelectionForPointer+daySelectionRange", anchor: a, pointer: p },
      output: {
        selection: { start: sel.start.toString(), end: sel.end.toString() },
        range: rpcRange(daySelectionRange(sel)),
      },
    })
  }
  const anchors = [0, 7.4, 14.99, 15, 540, 547.5, 1425, 1439.9, 1440, -10]
  const pointers = [-30, 0, 7, 15, 16, 539, 540, 541, 600, 1430, 1440, 1500]
  for (const anchor of anchors) {
    for (const pointer of pointers) {
      cases.push({
        name: `select ${anchor} → ${pointer}`,
        input: { fn: "selectionForPointer", anchorMinutes: anchor, pointerMinutes: pointer },
        output: selectionForPointer(anchor, pointer),
      })
    }
  }
  for (const viewerTz of [B, "America/New_York", "Australia/Lord_Howe"]) {
    for (const day of ["2026-06-16", "2026-03-29", "2026-10-25", "2026-03-08", "2026-10-04"]) {
      for (const selection of [
        { startMinutes: 540, endMinutes: 600 },
        { startMinutes: 120, endMinutes: 210 },
        { startMinutes: 90, endMinutes: 150 },
        { startMinutes: 1380, endMinutes: 1440 },
        { startMinutes: 0, endMinutes: 15 },
      ]) {
        cases.push({
          name: `range ${viewerTz} ${day} ${selection.startMinutes}-${selection.endMinutes}`,
          input: { fn: "selectionRange", viewerTz, day, selection },
          output: withViewer(viewerTz, () => rpcRange(selectionRange(date(day), selection))),
        })
      }
    }
  }
  const rect = { top: 100, height: 1152 }
  for (const y of [100, 101, 148, 676, 1252, 1300, 50]) {
    cases.push({
      name: `minutesAtY ${y}`,
      input: { fn: "minutesAtY", rect, y },
      output: minutesAtY(rect, y),
    })
  }
  const domRect = {
    left: 10,
    top: 20,
    right: 210,
    bottom: 320,
    width: 200,
    height: 300,
    x: 10,
    y: 20,
  }
  for (const [x, y] of [
    [0, 0],
    [10, 20],
    [100, 100],
    [500, 500],
    [210, 320],
    [11, 21],
  ]) {
    cases.push({
      name: `clamp ${x},${y}`,
      input: { fn: "clampPointToRect", rect: { left: 10, top: 20, right: 210, bottom: 320 }, x, y },
      output: clampPointToRect(domRect as DOMRectReadOnly, x, y),
    })
  }
  writeFixture(CRATE, "drag_to_create", {
    source: "src/lib/drag-to-create.ts",
    description:
      "Drag-to-create math: day selections (inclusive) and their all-day [start, end) range, snapped minute selections (15-min slots), wallclock ranges in the viewer zone (24:00 → next-day midnight; DST gaps resolve later), minutesAtY and clampPointToRect.",
    cases,
  })
})

it("week snap", () => {
  const cases: FixtureCase[] = []
  for (const [from, velocity, max] of [
    [0, 0, 1000],
    [100, 400, 1000],
    [100, -400, 1000],
    [950, 1000, 1000],
    [20, -1000, 1000],
    [100, 400, -5],
  ]) {
    cases.push({
      name: `predict ${from} ${velocity} ${max}`,
      input: { fn: "predictFlingEnd", from, velocity, maxOffset: max },
      output: predictFlingEnd(from, velocity, max),
    })
  }
  for (const [offset, row, max] of [
    [0, 120, 1000],
    [59, 120, 1000],
    [60, 120, 1000],
    [61, 120, 1000],
    [990, 120, 1000],
    [-30, 120, 1000],
  ]) {
    cases.push({
      name: `snap ${offset} ${row} ${max}`,
      input: { fn: "pickSnapTarget", offset, rowHeight: row, maxOffset: max },
      output: pickSnapTarget(offset, row, max),
    })
  }
  for (const from of [0, 100, 120, 239.5, 960]) {
    for (const velocity of [0, 1, -1, 50, -50, 400, -400, 2000]) {
      for (const row of [0, 120]) {
        cases.push({
          name: `fling ${from} ${velocity} ${row}`,
          input: { fn: "pickFlingTarget", from, velocity, rowHeight: row, maxOffset: 1000 },
          output: pickFlingTarget(from, velocity, row, 1000) ?? null,
        })
      }
    }
  }
  const logs: Record<string, { t: number; deltaY: number; deltaMode?: number }[]> = {
    empty: [],
    "two events": [
      { t: 0, deltaY: 10 },
      { t: 10, deltaY: 12 },
    ],
    "uniform mouse wheel": [
      { t: 0, deltaY: 100 },
      { t: 10, deltaY: 100 },
      { t: 20, deltaY: 100 },
    ],
    "varied touchpad": [
      { t: 0, deltaY: 3 },
      { t: 10, deltaY: 7 },
      { t: 20, deltaY: 12 },
    ],
    "old events ignored": [
      { t: 0, deltaY: 3 },
      { t: 10, deltaY: 7 },
      { t: 300, deltaY: 12 },
      { t: 310, deltaY: 12 },
    ],
    "line mode": [
      { t: 0, deltaY: 3 },
      { t: 10, deltaY: 7, deltaMode: 1 },
      { t: 20, deltaY: 12 },
    ],
    "sign only differs": [
      { t: 0, deltaY: 5 },
      { t: 10, deltaY: -5 },
      { t: 20, deltaY: 5 },
    ],
  }
  for (const [name, log] of Object.entries(logs)) {
    cases.push({
      name: `classify ${name}`,
      input: { fn: "classifyGesture", wheelLog: log },
      output: classifyGesture(log),
    })
  }
  for (const [v, d] of [
    [0, 100],
    [100, 0],
    [400, 100],
    [-400, 100],
    [10000, 10],
    [10, 100],
  ]) {
    cases.push({
      name: `decay ${v} ${d}`,
      input: { fn: "decayRate", velocity: v, distance: d },
      output: decayRate(v, d),
    })
  }
  writeFixture(CRATE, "week_snap", {
    source: "src/components/main/month-view/weekSnapFling.ts",
    description:
      "Month-view week snapping math: fling prediction, snap/fling targets (null = no fling), gesture classification and decay rate.",
    cases,
  })
})
