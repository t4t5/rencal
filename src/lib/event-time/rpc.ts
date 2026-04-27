import { Temporal } from "@js-temporal/polyfill"

import type { RpcEventTime } from "@/rpc/bindings"

import type { EventTime } from "./types"

export function fromRpcEventTime(w: RpcEventTime): EventTime {
  switch (w.kind) {
    case "date":
      return { kind: "date", value: Temporal.PlainDate.from(w.date) }
    case "datetime_utc":
      return { kind: "datetime_utc", value: Temporal.Instant.from(w.instant) }
    case "datetime_floating":
      return { kind: "datetime_floating", value: Temporal.PlainDateTime.from(w.wallclock) }
    case "datetime_zoned":
      return {
        kind: "datetime_zoned",
        value: Temporal.PlainDateTime.from(w.wallclock).toZonedDateTime(w.tzid),
      }
  }
}

export function toRpcEventTime(et: EventTime): RpcEventTime {
  switch (et.kind) {
    case "date":
      return { kind: "date", date: et.value.toString() }
    case "datetime_utc":
      return { kind: "datetime_utc", instant: et.value.toString() }
    case "datetime_floating":
      return { kind: "datetime_floating", wallclock: et.value.toString({ smallestUnit: "second" }) }
    case "datetime_zoned":
      return {
        kind: "datetime_zoned",
        wallclock: et.value.toPlainDateTime().toString({ smallestUnit: "second" }),
        tzid: et.value.timeZoneId,
      }
  }
}
