import { Temporal } from "@js-temporal/polyfill"
import { RRule, rrulestr } from "rrule"
import { afterAll, it, vi } from "vitest"

import type { RpcRecurrence } from "@/rpc/bindings"

import type { Calendar, Contact } from "@/lib/api"
import { recurrenceToRpc, rpcToRecurrence } from "@/lib/cal-events"
import {
  formatGroupName,
  getGroupOptions,
  getStoredActiveGroup,
  getVisibleCalendarSlugs,
  normalizeCalendarGroups,
} from "@/lib/calendar-groups"
import {
  calendarConferenceProvider,
  conferenceForCalendar,
  detectConference,
  getMeetingUrl,
  hasVideoMeeting,
  isWithinJoinWindow,
  JOIN_LEAD_MINUTES,
  type EventConference,
} from "@/lib/conference"
import { isValidContactEmail, suggestContacts } from "@/lib/contact-suggestions"
import { fromRpcEventTime } from "@/lib/event-time/rpc"
import { detectEventUrl, findUrls, toOpenableUrl } from "@/lib/event-url"
import { parseEventText, segmentEventText } from "@/lib/magic-parser"
import { anchorRangeToRecurringMaster } from "@/lib/recurrence-edit"
import {
  createRRuleWithDtstart,
  recurrenceToRRuleSet,
  rruleToRecurrence,
  withNearestOccurrence,
} from "@/lib/rrule-utils"
import { prepareSearchResults } from "@/lib/search-results"

import {
  capture,
  et,
  makeEvent,
  rpc,
  rpcRange,
  setNow,
  withViewer,
  writeFixture,
  type EventSpec,
  type FixtureCase,
} from "./shared"

const CRATE = "rencal-text"
const B = "Europe/Berlin"

afterAll(() => {
  vi.useRealTimers()
})

// ---------------------------------------------------------------- magic parser

const SUMMARIES = [
  "Lunch with Anna",
  "Dentist",
  "Team standup",
  "Call mom",
  "Flight to Paris",
  "Review PR",
  "Gym",
  "Birthday party",
]

const TIME_PHRASES = [
  "today",
  "tomorrow",
  "tonight",
  "tomorrow at 3pm",
  "at 3pm",
  "3pm",
  "at 15:00",
  "at 9",
  "at noon",
  "at midnight",
  "monday",
  "on friday",
  "next monday",
  "friday 10am",
  "next week",
  "in 2 hours",
  "in 30 minutes",
  "in 3 days",
  "june 15",
  "on 15 june",
  "June 15th at 2pm",
  "6/15",
  "2026-06-15",
  "jun 15 2027",
  "3pm-4pm",
  "3-4pm",
  "from 3pm to 5pm",
  "10am to noon",
  "tomorrow 9-10",
  "friday from 2 to 4pm",
  "this weekend",
  "next month",
  "dec 31 at 11:30pm",
  "april 19",
  "yesterday",
  "at 9:45am tomorrow",
  "tomorrow morning",
  "this evening",
  "sat 8pm",
  "the 25th",
]

const HANDWRITTEN = [
  "Holiday from june 15 to june 18",
  "Holiday from june 15 to june 18 in Spain",
  "Lunch tomorrow at 1pm at Cafe Luna",
  "Coffee at 10am at Blue Bottle",
  "Meeting in Berlin",
  "Meeting at the office",
  "Dinner at 7 in Kreuzberg",
  "Standup every weekday at 9:30",
  "Yoga every monday at 7am",
  "Yoga every Monday 7am in the park",
  "Pay rent every month",
  "Anniversary every year on june 15",
  "Water plants every day",
  "Water plants every day at 8pm",
  "Brunch every weekend at 11",
  "Team sync every week",
  "Every friday drinks at 6pm",
  "every tuesday",
  "every sunday at 10am at church",
  "Review every week on thursday at 4pm",
  "Call with Bob every day at 9 in Zoom",
  "Gym everyday",
  "every   friday   at 5pm",
  "Trip from monday to wednesday",
  "Conference 3 to 5 june",
  "Workshop june 3 - june 5",
  "Sprint planning 2026-05-04 10:00",
  "Call at 3",
  "Call at 3 in room 4",
  "Party on saturday",
  "Party on saturday night",
  "Doctor on the 3rd at 2:30pm",
  "Exam next friday at 8",
  "Deadline end of month",
  "Lunch in 1 hour",
  "Pickup at 5:15pm at the station",
  "Movie tonight at 9",
  "Meet Sam at Central Park",
  "Concert from 8pm to 11pm at the Arena",
  "Flight at 6am tomorrow",
  "Overnight train 22:00 to 06:00",
  "Read a book",
  "",
  "   ",
  "at",
  "in",
  "Meeting at",
  "Lunch in ",
  "3pm",
  "tomorrow",
  "Q3 planning",
  "Call 555-1234",
  "Version 2.0 release",
  "Breakfast at 7:00",
  "Breakfast at 07:00 tomorrow",
  "noon lunch",
  "Run 5k at 6am",
  "Event on 12/25",
  "Event on 25/12",
  "Christmas dinner on december 25 at 6pm",
  "New Year party dec 31 9pm to jan 1 2am",
  "Weekly 1:1 every thursday 14:00",
  "Café with Zoë tomorrow at 10",
  "Meeting with José at 3pm in Málaga",
  "Lunch at 12:30 in München",
  "Trip to 東京 next monday",
]

type MagicInput = { text: string; referenceWallclock: string; viewerTz: string }

function magicCorpus(): MagicInput[] {
  const ref = "2026-04-20T10:30:00" // Monday
  const inputs: MagicInput[] = [
    // The phrase from src/lib/magic-parser.test.ts, with its reference date.
    {
      text: "Holiday from june 15 to june 18",
      referenceWallclock: "2026-04-20T00:00:00",
      viewerTz: B,
    },
  ]
  for (const text of HANDWRITTEN) inputs.push({ text, referenceWallclock: ref, viewerTz: B })
  for (const [i, phrase] of TIME_PHRASES.entries()) {
    for (const [j, summary] of SUMMARIES.entries()) {
      // Each phrase appears before and after a rotating subset of summaries.
      if ((i + j) % 3 !== 0) continue
      inputs.push({ text: `${summary} ${phrase}`, referenceWallclock: ref, viewerTz: B })
      if (j % 2 === 0)
        inputs.push({ text: `${phrase} ${summary}`, referenceWallclock: ref, viewerTz: B })
    }
  }
  // Year rollover and late-evening references.
  for (const text of [
    "Party tomorrow",
    "Brunch jan 2",
    "Review monday 9am",
    "Drinks at 1am",
    "Call in 2 hours",
    "Holiday dec 31 to jan 3",
  ]) {
    inputs.push({ text, referenceWallclock: "2026-12-30T23:00:00", viewerTz: B })
  }
  // Viewer zone differs from the process zone; DST transition days.
  for (const text of [
    "Standup tomorrow at 9",
    "Call march 8 at 2:30am",
    "Call march 29 at 2:30am",
    "Brunch every sunday at 11",
  ]) {
    inputs.push({ text, referenceWallclock: ref, viewerTz: "America/New_York" })
    inputs.push({ text, referenceWallclock: "2026-03-07T12:00:00", viewerTz: B })
  }
  return inputs
}

/** Local-components Date, the way the app passes the viewer's wallclock to chrono-node. */
function refDate(wallclock: string): Date {
  const p = Temporal.PlainDateTime.from(wallclock)
  return new Date(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
}

it("magic parser", () => {
  const inputs = magicCorpus()
  const seen = new Map<string, number>()
  const cases: FixtureCase[] = inputs.map((input) => {
    const base = `${JSON.stringify(input.text)} @ ${input.referenceWallclock} ${input.viewerTz}`
    const n = seen.get(base) ?? 0
    seen.set(base, n + 1)
    return {
      name: n ? `${base} #${n + 1}` : base,
      input,
      output: withViewer(input.viewerTz, () => {
        const parsed = parseEventText(input.text, refDate(input.referenceWallclock))
        let offset = 0
        const segments = segmentEventText(input.text, refDate(input.referenceWallclock)).map(
          (segment) => {
            const start = offset
            offset += segment.text.length
            return { text: segment.text, parsed: segment.parsed, start, end: offset }
          },
        )
        return {
          summary: parsed.summary,
          start: parsed.start && rpc(parsed.start),
          end: parsed.end && rpc(parsed.end),
          recurrence: parsed.recurrence && recurrenceToRpc(parsed.recurrence),
          location: parsed.location,
          chronoMatchText: parsed.chronoMatchText,
          segments,
        }
      }),
    }
  })
  if (cases.length < 200) throw new Error(`magic parser corpus too small: ${cases.length}`)
  writeFixture(CRATE, "magic_parser", {
    source: "src/lib/magic-parser.ts",
    description:
      "parseEventText + segmentEventText (chrono-node, forwardDate). `referenceWallclock` is the viewer's local wallclock passed to chrono as a local-components Date (process zone Europe/Berlin). Segment `start`/`end` are UTF-16 code-unit offsets into `text` (equal to char offsets for ASCII; convert for Rust byte offsets). Only the first chrono match is used; outputs mirror chrono-node 2.x behaviour, including its quirks.",
    cases,
  })
})

// ---------------------------------------------------------------- recurrence

const RRULES = [
  "FREQ=DAILY",
  "FREQ=WEEKLY",
  "FREQ=WEEKLY;INTERVAL=2",
  "FREQ=MONTHLY",
  "FREQ=YEARLY",
  "FREQ=WEEKLY;BYDAY=MO",
  "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR",
  "FREQ=WEEKLY;BYDAY=SA,SU",
  "FREQ=DAILY;COUNT=5",
  "FREQ=DAILY;UNTIL=20260625T000000Z",
  "FREQ=MONTHLY;BYMONTHDAY=31",
  "FREQ=MONTHLY;BYDAY=2TU",
  "FREQ=MONTHLY;BYDAY=-1FR",
  "FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=29",
  "FREQ=WEEKLY;WKST=SU;BYDAY=SU,WE",
  "FREQ=DAILY;BYHOUR=9,17;BYMINUTE=0",
  "FREQ=WEEKLY;INTERVAL=3;BYDAY=TH;COUNT=4",
]

const fakeUtc = (d: Date) => d.toISOString().slice(0, 16)

it("recurrence", () => {
  setNow("2026-06-15T08:00:00Z")
  const cases: FixtureCase[] = []

  for (const rule of RRULES) {
    for (const dtstart of ["2026-06-15T09:00", "2026-01-31T00:00", "2024-02-29T18:30"]) {
      const start = new Date(`${dtstart}:00Z`)
      cases.push({
        name: `occurrences ${rule} from ${dtstart}`,
        input: { fn: "createRRuleWithDtstart", rrule: rule, dtstart },
        output: capture(() => {
          const r = createRRuleWithDtstart(rule, start)
          return {
            toString: r.toString(),
            first: r.all((_, i) => i < 8).map(fakeUtc),
          }
        }),
      })
    }
    cases.push({
      name: `text ${rule}`,
      input: { fn: "toText", rrule: rule },
      output: capture(() => rrulestr(rule).toText()),
    })
  }

  // RepeatSelect presets: value strings and labels shown for each.
  const presets = [
    new RRule({ freq: RRule.DAILY }),
    new RRule({ freq: RRule.WEEKLY }),
    new RRule({ freq: RRule.WEEKLY, interval: 2 }),
    new RRule({ freq: RRule.MONTHLY }),
    new RRule({ freq: RRule.YEARLY }),
  ]
  for (const preset of presets) {
    cases.push({
      name: `preset ${preset.toString()}`,
      input: { fn: "RepeatSelect preset" },
      output: { value: preset.toString(), text: preset.toText() },
    })
  }

  const recurrences: Record<string, RpcRecurrence> = {
    plain: { rrule: "FREQ=WEEKLY;BYDAY=MO", exdates: [], rdates: [] },
    "with exdates": {
      rrule: "FREQ=DAILY",
      exdates: [et.zoned("2026-06-16T09:00:00", B), et.zoned("2026-06-17T09:00:00", B)],
      rdates: [],
    },
    "with rdates": {
      rrule: "FREQ=MONTHLY;BYMONTHDAY=1",
      exdates: [],
      rdates: [et.zoned("2026-06-20T09:00:00", B), et.utc("2026-07-04T15:00:00Z")],
    },
    "all-day exdate": {
      rrule: "FREQ=WEEKLY",
      exdates: [et.date("2026-06-22")],
      rdates: [et.date("2026-06-25")],
    },
  }
  for (const [name, r] of Object.entries(recurrences)) {
    cases.push({
      name: `rruleset round trip ${name}`,
      input: { fn: "recurrenceToRRuleSet+rruleToRecurrence", viewerTz: B, recurrence: r },
      output: withViewer(B, () => {
        const set = recurrenceToRRuleSet(rpcToRecurrence(r))
        const back = rruleToRecurrence(set)
        return { rruleSet: set.toString(), recurrence: back && recurrenceToRpc(back) }
      }),
    })
  }

  // withNearestOccurrence: masters × "now" wallclocks.
  const masters: EventSpec[] = [
    {
      id: "weekly-mon",
      start: et.zoned("2026-01-05T09:00:00", B),
      end: et.zoned("2026-01-05T10:00:00", B),
      recurrence: { rrule: "FREQ=WEEKLY;BYDAY=MO", exdates: [], rdates: [] },
    },
    {
      id: "daily-exdates",
      start: et.zoned("2026-06-01T09:00:00", B),
      end: et.zoned("2026-06-01T09:30:00", B),
      recurrence: {
        rrule: "FREQ=DAILY;COUNT=20",
        exdates: [et.zoned("2026-06-15T09:00:00", B), et.zoned("2026-06-16T09:00:00", B)],
        rdates: [],
      },
    },
    {
      id: "ended",
      start: et.date("2026-01-01"),
      end: et.date("2026-01-02"),
      recurrence: { rrule: "FREQ=WEEKLY;COUNT=3", exdates: [], rdates: [] },
    },
    {
      id: "rdate-only-ahead",
      start: et.zoned("2026-05-01T12:00:00", "America/New_York"),
      end: et.zoned("2026-05-01T13:00:00", "America/New_York"),
      recurrence: {
        rrule: "FREQ=YEARLY",
        exdates: [],
        rdates: [et.zoned("2026-06-20T12:00:00", "America/New_York")],
      },
    },
    {
      id: "multi-day-allday",
      start: et.date("2026-03-30"),
      end: et.date("2026-04-02"),
      recurrence: { rrule: "FREQ=MONTHLY", exdates: [], rdates: [] },
    },
    {
      id: "dst-crossing",
      start: et.zoned("2026-03-01T02:30:00", B),
      end: et.zoned("2026-03-01T03:30:00", B),
      recurrence: { rrule: "FREQ=WEEKLY", exdates: [], rdates: [] },
    },
    { id: "not-recurring", start: et.date("2026-06-15"), end: et.date("2026-06-16") },
    {
      id: "bad-rrule",
      start: et.date("2026-06-15"),
      end: et.date("2026-06-16"),
      recurrence: { rrule: "FREQ=NOPE", exdates: [], rdates: [] },
    },
  ]
  for (const spec of masters) {
    for (const now of [
      "2026-06-15T08:00:00",
      "2026-06-15T09:30:00",
      "2026-03-29T12:00:00",
      "2027-01-01T00:00:00",
    ]) {
      cases.push({
        name: `nearest ${spec.id} at ${now}`,
        input: { fn: "withNearestOccurrence", viewerTz: B, event: spec, now },
        output: withViewer(B, () => {
          const shifted = withNearestOccurrence(makeEvent(spec), Temporal.PlainDateTime.from(now))
          return { start: rpc(shifted.start), end: rpc(shifted.end) }
        }),
      })
    }
  }

  for (const [current, master] of [
    [
      [et.zoned("2026-06-17T09:00:00", B), et.zoned("2026-06-17T10:00:00", B)],
      et.zoned("2026-06-01T08:00:00", B),
    ],
    [[et.date("2026-06-17"), et.date("2026-06-19")], et.date("2026-06-01")],
    [
      [et.zoned("2026-06-17T23:00:00", B), et.zoned("2026-06-18T01:00:00", B)],
      et.zoned("2026-05-31T23:00:00", "America/New_York"),
    ],
  ] as const) {
    cases.push({
      name: `anchor ${JSON.stringify(current[0])} to ${JSON.stringify(master)}`,
      input: {
        fn: "anchorRangeToRecurringMaster",
        viewerTz: B,
        current: { start: current[0], end: current[1] },
        masterStart: master,
      },
      output: withViewer(B, () =>
        rpcRange(
          anchorRangeToRecurringMaster(
            { start: fromRpcEventTime(current[0]), end: fromRpcEventTime(current[1]) },
            fromRpcEventTime(master),
          ),
        ),
      ),
    })
  }
  vi.useRealTimers()

  writeFixture(CRATE, "recurrence", {
    source: [
      "src/lib/rrule-utils.ts",
      "src/lib/recurrence-edit.ts",
      "src/components/event-parts/inputs/RepeatSelect.tsx",
    ],
    description:
      "rrule.js-backed helpers. Occurrence datetimes are rrule.js 'fake UTC' wallclocks (YYYY-MM-DDTHH:MM). `toText` is rrule.js's English text (RepeatSelect's label for non-preset rules). withNearestOccurrence takes `now` as a viewer-zone wallclock. Round trips bridge exdates/rdates through local-components Dates (process zone Europe/Berlin = viewer zone).",
    cases,
  })
})

// ---------------------------------------------------------------- links

const LINK_TEXTS = [
  "https://us02web.zoom.us/j/123456789?pwd=abc123",
  "https://company.zoom.us/my/room",
  "https://zoomgov.com/j/555",
  "https://meet.google.com/abc-defg-hij",
  "https://teams.microsoft.com/l/meetup-join/xyz",
  "https://teams.live.com/meet/123",
  "https://company.webex.com/meet/someone",
  "https://meet.jit.si/SomeRoom",
  "https://whereby.com/some-room",
  "https://www.whereby.com/some-room",
  "https://meet.proton.me/example",
  "Join here: https://zoom.us/j/99887766 (passcode 1234)",
  "(https://meet.google.com/abc-defg-hij)",
  "Link: https://meet.google.com/abc-defg-hij.",
  "https://zoom.us",
  "https://example.com/zoom.us/j/123",
  "HTTPS://MEET.GOOGLE.COM/ABC",
  "Room 4, https://zoom.us/j/1 and https://meet.google.com/x",
  "https://example.com",
  "www.example.com/path",
  "See https://a.example/x then http://b.example and www.c.example",
  "foowww.example.com",
  "Tickets: https://example.com/tickets.",
  "(more at https://example.com/info).",
  "Read https://en.wikipedia.org/wiki/Foo_(bar) first",
  "(Read https://en.wikipedia.org/wiki/Foo_(bar))",
  "Really? https://example.com/?q=1!",
  "https://example.com/a and https://example.com/b",
  "Flight details: https://www.flighty.app/",
  "[docs](https://docs.example/agenda])",
  "<https://venue.example/map>",
  '"https://quoted.example/x"',
  "mailto:someone@example.com",
  "no links here",
  "",
]

it("conference and links", () => {
  const conference: FixtureCase[] = []
  for (const text of LINK_TEXTS) {
    conference.push({
      name: `detect ${JSON.stringify(text)}`,
      input: { fn: "detectConference", text },
      output: detectConference(text),
    })
  }
  const live = (url: string): EventConference => ({ status: "live", provider: "google", url })
  const shapes: { name: string; conference: EventConference | null; location: string | null }[] = [
    { name: "nothing", conference: null, location: null },
    { name: "zoom location", conference: null, location: "https://zoom.us/j/1" },
    { name: "plain location", conference: null, location: "Room 4" },
    { name: "requested", conference: { status: "requested", provider: "google" }, location: null },
    {
      name: "requested + zoom",
      conference: { status: "requested", provider: "google" },
      location: "https://zoom.us/j/1",
    },
    { name: "live", conference: live("https://meet.google.com/a"), location: null },
    {
      name: "live + zoom",
      conference: live("https://meet.google.com/a"),
      location: "https://zoom.us/j/1",
    },
  ]
  for (const shape of shapes) {
    conference.push({
      name: `meeting ${shape.name}`,
      input: {
        fn: "hasVideoMeeting+getMeetingUrl",
        conference: shape.conference,
        location: shape.location,
      },
      output: { hasVideoMeeting: hasVideoMeeting(shape), getMeetingUrl: getMeetingUrl(shape) },
    })
  }
  const start = 1_781_600_000_000
  for (const delta of [-60, -11, -10, -9, 0, 30, 59, 60, 61]) {
    const nowMs = start + delta * 60_000
    conference.push({
      name: `join window ${delta}m`,
      input: { fn: "isWithinJoinWindow", startMs: start, endMs: start + 60 * 60_000, nowMs },
      output: isWithinJoinWindow({ startMs: start, endMs: start + 60 * 60_000 }, nowMs),
    })
  }
  const cal = (provider: string | null): Calendar => ({
    slug: "c",
    name: null,
    color: null,
    provider,
    account: null,
    read_only: false,
  })
  for (const provider of ["google", "outlook", null]) {
    for (const conf of [
      null,
      { status: "requested", provider: "google" },
      { status: "requested", provider: "outlook" },
      live("https://x.example"),
    ] as (EventConference | null)[]) {
      conference.push({
        name: `for calendar ${provider} ${JSON.stringify(conf)}`,
        input: { fn: "conferenceForCalendar", provider, conference: conf },
        output: {
          provider: calendarConferenceProvider(cal(provider)),
          conference: conferenceForCalendar(conf, cal(provider)),
        },
      })
    }
  }
  conference.push({
    name: "no calendar",
    input: {
      fn: "conferenceForCalendar",
      provider: "<undefined calendar>",
      conference: { status: "requested", provider: "google" },
    },
    output: {
      provider: calendarConferenceProvider(undefined),
      conference: conferenceForCalendar({ status: "requested", provider: "google" }, undefined),
    },
  })
  conference.push({
    name: "join lead",
    input: { fn: "JOIN_LEAD_MINUTES" },
    output: JOIN_LEAD_MINUTES,
  })
  writeFixture(CRATE, "conference", {
    source: "src/lib/conference.ts",
    description:
      "Meeting-link detection (label + trimmed url, or null), video-meeting predicates, the join window and calendar provisioning rules.",
    cases: conference,
  })

  const urls: FixtureCase[] = []
  for (const text of LINK_TEXTS) {
    urls.push({
      name: `find ${JSON.stringify(text)}`,
      input: { fn: "findUrls", text },
      output: findUrls(text),
    })
  }
  for (const url of [
    "https://example.com",
    "http://example.com",
    "example.com",
    "example.com/a",
    "www.example.com/path",
    "mailto:someone@example.com",
    "tel:+123",
    "ftp://x.example",
    "a+b.c-d:thing",
  ]) {
    urls.push({
      name: `openable ${url}`,
      input: { fn: "toOpenableUrl", url },
      output: toOpenableUrl(url),
    })
  }
  const events = [
    { url: null, description: null, location: null, conference: null },
    {
      url: null,
      description: "Agenda: https://docs.example/agenda",
      location: null,
      conference: null,
    },
    {
      url: null,
      description: "https://docs.example/agenda",
      location: "https://venue.example/map",
      conference: null,
    },
    {
      url: "https://venue.example/map",
      description: "https://docs.example/agenda",
      location: "https://venue.example/map",
      conference: null,
    },
    {
      url: "venue.example/map",
      description: null,
      location: "https://venue.example/map",
      conference: null,
    },
    {
      url: null,
      description: "Join https://zoom.us/j/1 or see https://docs.example",
      location: "https://zoom.us/j/1",
      conference: null,
    },
    {
      url: null,
      description: "https://meet.google.com/a then https://meet.jit.si/standup",
      location: null,
      conference: live("https://meet.google.com/a"),
    },
    { url: null, description: "https://meet.jit.si/standup", location: null, conference: null },
    { url: "  ", description: "www.example.com", location: null, conference: null },
  ]
  for (const [i, event] of events.entries()) {
    urls.push({
      name: `detect event ${i}`,
      input: { fn: "detectEventUrl", event },
      output: detectEventUrl(event),
    })
  }
  writeFixture(CRATE, "event_url", {
    source: "src/lib/event-url.ts",
    description:
      "Link finding in free text (trailing punctuation and unbalanced brackets trimmed), toOpenableUrl, and the first link worth showing for an event.",
    cases: urls,
  })
})

// ---------------------------------------------------------------- contacts, groups, search

it("contacts", () => {
  const contact = (email: string, name: string | null, count: number): Contact => ({
    email,
    name,
    count,
    last_seen: "2026-01-01T00:00:00Z",
  })
  const contacts = [
    contact("zara@example.com", "Zara Zee", 10),
    contact("alex@example.com", "Jordan Smith", 8),
    contact("sam@example.com", "Alex Cooper", 6),
    contact("person-alex@example.com", "Casey Example", 4),
    contact("Mixed.Case@Example.com", "Mary Ann Jones", 3),
    contact("noname@example.org", null, 2),
    contact("/andm3ndgynjj5ndm3ndgynkmkgsbdxwst...", "Tristan", 8),
    contact("tristan@example.com", "Tristan", 10),
    contact("bad@nodot", "Bad", 1),
    contact(" spaced@example.com ", "Spaced", 1),
    ...Array.from({ length: 10 }, (_, i) =>
      contact(`team${i}@corp.example`, `Team Member ${i}`, 1),
    ),
  ]
  const cases: FixtureCase[] = []
  for (const [query, exclude, limit] of [
    ["", [], undefined],
    ["   ", [], undefined],
    ["alex", [], undefined],
    ["ALEX", [], undefined],
    ["@example", [" ALEX@example.com "], undefined],
    ["tristan", [], undefined],
    ["ann", [], undefined],
    ["jones", [], undefined],
    ["mixed", [], undefined],
    ["noname", [], undefined],
    ["team", [], undefined],
    ["team", ["team0@corp.example"], 3],
    ["member 1", [], undefined],
    ["corp", [], 20],
    ["spaced", [], undefined],
    ["zzz", [], undefined],
    [" sam ", [], undefined],
  ] as [string, string[], number | undefined][]) {
    cases.push({
      name: `suggest ${JSON.stringify(query)} excl ${exclude.join(",")} limit ${limit ?? "default"}`,
      input: { fn: "suggestContacts", query, excludeEmails: exclude, limit: limit ?? null },
      output: suggestContacts(contacts, query, exclude, limit).map((c) => c.email),
    })
  }
  for (const email of ["a@b.c", "a@b", "a b@c.d", " A@B.CD ", "@b.c", "a@.c", "x@y.z.w", ""]) {
    cases.push({
      name: `valid ${JSON.stringify(email)}`,
      input: { fn: "isValidContactEmail", email },
      output: isValidContactEmail(email),
    })
  }
  writeFixture(CRATE, "contact_suggestions", {
    source: "src/lib/contact-suggestions.ts",
    description:
      "suggestContacts over the contact list below (outputs are emails in rank order; limit null = default 8) and isValidContactEmail.",
    cases: [{ name: "contact list", input: { fn: "contacts" }, output: contacts }, ...cases],
  })
})

it("calendar groups", () => {
  const cases: FixtureCase[] = []
  const groupSets: Record<string, Partial<Record<string, string[]>>> = {
    empty: {},
    simple: { work: ["w1", "w2"], home: ["h1"] },
    "with default": { default: ["w1", "h1"], work: ["w1"], Zeta: [], alpha: ["missing"] },
    junk: { work: ["w1"], broken: undefined },
  }
  const calendars = [{ slug: "w1" }, { slug: "w2" }, { slug: "h1" }]
  for (const [name, groups] of Object.entries(groupSets)) {
    const normalized = normalizeCalendarGroups(groups)
    cases.push({
      name: `groups ${name}`,
      input: { fn: "normalize+options+visible", groups, calendars: calendars.map((c) => c.slug) },
      output: {
        normalized,
        options: getGroupOptions(normalized),
        visible: Object.fromEntries(
          ["default", "work", "home", "alpha", "Zeta", "unknown"].map((g) => [
            g,
            getVisibleCalendarSlugs({ calendars, groups: normalized, activeGroup: g }),
          ]),
        ),
      },
    })
  }
  for (const name of ["default", "work", "", "x", "Ünicode", "two words"]) {
    cases.push({
      name: `format ${JSON.stringify(name)}`,
      input: { fn: "formatGroupName", name },
      output: formatGroupName(name),
    })
  }
  for (const stored of [null, '"work"', "work", "42", '{"a":1}', '""']) {
    const storage = { getItem: () => stored } as unknown as Storage
    cases.push({
      name: `stored ${JSON.stringify(stored)}`,
      input: { fn: "getStoredActiveGroup", stored },
      output: getStoredActiveGroup(storage),
    })
  }
  writeFixture(CRATE, "calendar_groups", {
    source: "src/lib/calendar-groups.ts",
    description:
      "Calendar group normalisation, option ordering, visible calendars per active group, display names, and the stored active group (`stored` is the raw localStorage value).",
    cases,
  })
})

it("search results", () => {
  const specs: EventSpec[] = [
    {
      id: "past",
      start: et.zoned("2026-05-01T09:00:00", B),
      end: et.zoned("2026-05-01T10:00:00", B),
    },
    {
      id: "soon",
      start: et.zoned("2026-06-15T11:00:00", B),
      end: et.zoned("2026-06-15T12:00:00", B),
    },
    { id: "far", start: et.date("2027-03-01"), end: et.date("2027-03-02") },
    { id: "yesterday", start: et.date("2026-06-14"), end: et.date("2026-06-15") },
    {
      id: "weekly",
      start: et.zoned("2025-01-06T09:00:00", B),
      end: et.zoned("2025-01-06T09:30:00", B),
      recurrence: { rrule: "FREQ=WEEKLY;BYDAY=MO", exdates: [], rdates: [] },
    },
    {
      id: "ended-series",
      start: et.zoned("2025-01-01T09:00:00", B),
      end: et.zoned("2025-01-01T10:00:00", B),
      recurrence: { rrule: "FREQ=DAILY;COUNT=3", exdates: [], rdates: [] },
    },
    { id: "utc", start: et.utc("2026-06-15T07:30:00Z"), end: et.utc("2026-06-15T08:00:00Z") },
  ]
  const cases: FixtureCase[] = []
  setNow("2026-06-15T08:00:00Z")
  for (const viewerTz of [B, "America/Los_Angeles"]) {
    for (const now of ["2026-06-15T08:00:00Z", "2026-06-16T23:30:00Z"]) {
      cases.push({
        name: `${viewerTz} at ${now}`,
        input: { viewerTz, now, events: specs },
        output: withViewer(viewerTz, () =>
          prepareSearchResults(specs.map(makeEvent), Temporal.Instant.from(now)).map((e) => ({
            id: e.id,
            start: rpc(e.start),
            end: rpc(e.end),
          })),
        ),
      })
    }
  }
  vi.useRealTimers()
  writeFixture(CRATE, "search_results", {
    source: "src/lib/search-results.ts",
    description:
      "prepareSearchResults: recurring masters moved to their nearest occurrence, then ordered by |start - now| (stable).",
    cases,
  })
})
