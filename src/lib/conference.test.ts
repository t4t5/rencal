import { describe, expect, it } from "vitest"

import type { Calendar } from "@/rpc/bindings"

import {
  calendarConferenceProvider,
  conferenceForCalendar,
  conferenceToRpc,
  rpcToConference,
  type EventConference,
} from "@/lib/conference"

const calendar = (provider: string | null): Calendar => ({
  slug: provider ?? "local",
  name: null,
  color: null,
  provider,
  account: null,
  read_only: false,
})

describe("calendarConferenceProvider", () => {
  it("only provisions conferences for Google calendars", () => {
    expect(calendarConferenceProvider(calendar("google"))).toBe("google")
    expect(calendarConferenceProvider(calendar("outlook"))).toBeNull()
    expect(calendarConferenceProvider(calendar(null))).toBeNull()
  })
})

describe("conferenceForCalendar", () => {
  it("drops requests that the target calendar cannot provision", () => {
    const requested: EventConference = { status: "requested", provider: "google" }

    expect(conferenceForCalendar(requested, calendar("google"))).toEqual(requested)
    expect(conferenceForCalendar(requested, calendar("outlook"))).toBeNull()
    expect(conferenceForCalendar(requested, undefined)).toBeNull()
  })

  it("preserves live conference links when changing calendars", () => {
    const live: EventConference = {
      status: "live",
      provider: "outlook",
      url: "https://teams.example/meeting",
    }

    expect(conferenceForCalendar(live, calendar("google"))).toEqual(live)
  })
})

describe("conference RPC conversion", () => {
  it.each<EventConference>([
    { status: "requested", provider: "google" },
    { status: "live", provider: "proton", url: "https://meet.proton.me/example" },
  ])("round-trips $status conferences", (conference) => {
    expect(rpcToConference(conferenceToRpc(conference))).toEqual(conference)
  })
})
