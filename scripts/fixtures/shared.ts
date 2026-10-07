import { Temporal } from "@js-temporal/polyfill"
import { mkdirSync, writeFileSync } from "fs"
import path from "path"
import { vi } from "vitest"

import type { CalendarEvent as RpcCalendarEvent, RpcEventTime } from "@/rpc/bindings"

import { rpcToCalendarEvent, type CalendarEvent } from "@/lib/cal-events"
import { setViewerTzid, type EventTime, type EventTimeRange } from "@/lib/event-time"
import { toRpcEventTime } from "@/lib/event-time/rpc"

const repoRoot = path.resolve(__dirname, "../..")

export type FixtureCase = { name: string; input: unknown; output: unknown }

export type Fixture = {
  /** TS module(s) that produced the outputs, relative to the repo root. */
  source: string | string[]
  /** What the cases exercise and any conventions a consumer needs. */
  description: string
  cases: FixtureCase[]
}

/** Recursively sort object keys so files are byte-stable regardless of construction order. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical((value as Record<string, unknown>)[key])]),
    )
  }
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new Error(`Non-finite number ${value} cannot be stored in a fixture`)
  }
  return value
}

/** Write `crates/<crate>/tests/fixtures/<name>.json`. */
export function writeFixture(crate: string, name: string, fixture: Fixture): void {
  const names = new Set<string>()
  for (const c of fixture.cases) {
    if (names.has(c.name)) throw new Error(`Duplicate case name "${c.name}" in ${crate}/${name}`)
    names.add(c.name)
  }
  const dir = path.join(repoRoot, "crates", crate, "tests", "fixtures")
  mkdirSync(dir, { recursive: true })
  const body = {
    source: fixture.source,
    description: fixture.description,
    cases: fixture.cases.map((c) => ({ name: c.name, input: c.input, output: c.output })),
  }
  // Key order inside `input`/`output` is canonicalised; the envelope keeps its natural order.
  const json = JSON.stringify(
    {
      ...body,
      cases: body.cases.map((c) => ({
        ...c,
        input: canonical(c.input),
        output: canonical(c.output),
      })),
    },
    null,
    2,
  )
  writeFileSync(path.join(dir, `${name}.json`), json + "\n")
}

/** Run `fn`, recording a thrown error as `{ error: message }` instead of failing. */
export function capture<T>(fn: () => T): T | { error: string } {
  try {
    return fn()
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) }
  }
}

/** Fix the viewer's zone (what the Rust tz watcher feeds the app). */
export function withViewer<T>(tzid: string, fn: () => T): T {
  setViewerTzid(tzid)
  return fn()
}

/** Fix "now" for code reading `Temporal.Now` / `Date.now`. */
export function setNow(instant: string): void {
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(new Date(instant))
}

export const rpc = (et: EventTime): RpcEventTime => toRpcEventTime(et)

export const rpcRange = (range: EventTimeRange) => ({
  start: rpc(range.start),
  end: rpc(range.end),
})

export const date = (iso: string): Temporal.PlainDate => Temporal.PlainDate.from(iso)

/** Compact event spec used as fixture input. */
export type EventSpec = {
  id: string
  start: RpcEventTime
  end: RpcEventTime
  calendar_slug?: string
  color?: string | null
  summary?: string
  location?: string | null
  description?: string | null
  url?: string | null
  recurrence?: RpcCalendarEvent["recurrence"]
  conference?: RpcCalendarEvent["conference"]
}

export function makeEvent(spec: EventSpec): CalendarEvent {
  return rpcToCalendarEvent({
    id: spec.id,
    recurring_event_id: null,
    summary: spec.summary ?? spec.id,
    description: spec.description ?? null,
    location: spec.location ?? null,
    url: spec.url ?? null,
    start: spec.start,
    end: spec.end,
    status: "confirmed",
    recurrence: spec.recurrence ?? null,
    master_recurrence: null,
    reminders: [],
    organizer: null,
    attendees: [],
    conference: spec.conference ?? null,
    calendar_slug: spec.calendar_slug ?? "cal",
    color: spec.color ?? null,
    updated: null,
  })
}

/** RpcEventTime constructors for terse corpora. */
export const et = {
  date: (d: string): RpcEventTime => ({ kind: "date", date: d }),
  utc: (instant: string): RpcEventTime => ({ kind: "datetime_utc", instant }),
  floating: (wallclock: string): RpcEventTime => ({ kind: "datetime_floating", wallclock }),
  zoned: (wallclock: string, tzid: string): RpcEventTime => ({
    kind: "datetime_zoned",
    wallclock,
    tzid,
  }),
}

/** Short stable label for an RpcEventTime, used in case names. */
export function label(t: RpcEventTime): string {
  switch (t.kind) {
    case "date":
      return `date ${t.date}`
    case "datetime_utc":
      return `utc ${t.instant}`
    case "datetime_floating":
      return `floating ${t.wallclock}`
    case "datetime_zoned":
      return `zoned ${t.wallclock} ${t.tzid}`
  }
}
