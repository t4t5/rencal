import { describe, expect, it } from "vitest"

import type { RpcRecurrence } from "@/rpc/bindings"

import { recurrenceToRpc, rpcToRecurrence } from "./cal-events"

describe("recurrence RPC conversion", () => {
  it("round-trips RDATEs without changing their event-time variants", () => {
    const recurrence: RpcRecurrence = {
      rrule: "FREQ=WEEKLY;BYDAY=MO",
      exdates: [{ kind: "date", date: "2026-09-21" }],
      rdates: [
        { kind: "date", date: "2026-09-22" },
        {
          kind: "datetime_zoned",
          wallclock: "2026-09-29T09:30:00",
          tzid: "Europe/London",
        },
      ],
    }

    expect(recurrenceToRpc(rpcToRecurrence(recurrence))).toEqual(recurrence)
  })
})
