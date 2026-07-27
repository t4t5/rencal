import { describe, expect, it } from "vitest"

import type { Calendar } from "@/rpc/bindings"

import {
  calendarConferenceProvider,
  conferenceForCalendar,
  conferenceToRpc,
  detectConference,
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

describe("detectConference", () => {
  it.each([
    ["https://us02web.zoom.us/j/123456789?pwd=abc123", "Zoom"],
    ["https://company.zoom.us/my/room", "Zoom"],
    ["https://meet.google.com/abc-defg-hij", "Google Meet"],
    ["https://teams.microsoft.com/l/meetup-join/xyz", "Microsoft Teams"],
    ["https://teams.live.com/meet/123", "Microsoft Teams"],
    ["https://company.webex.com/meet/someone", "Webex"],
    ["https://meet.jit.si/SomeRoom", "Jitsi"],
    ["https://whereby.com/some-room", "Whereby"],
    ["https://meet.proton.me/example", "Proton Meet"],
  ])("detects %s as %s", (url, label) => {
    expect(detectConference(url)).toEqual({ url, label })
  })

  it("extracts the link from surrounding text", () => {
    expect(detectConference("Join here: https://zoom.us/j/99887766 (passcode 1234)")).toEqual({
      url: "https://zoom.us/j/99887766",
      label: "Zoom",
    })
  })

  it("trims trailing punctuation from the link", () => {
    expect(detectConference("(https://meet.google.com/abc-defg-hij)")).toEqual({
      url: "https://meet.google.com/abc-defg-hij",
      label: "Google Meet",
    })
  })

  it("ignores locations without a meeting link", () => {
    expect(detectConference("Room 4B, Main Office")).toBeNull()
    expect(detectConference("https://zoom.us")).toBeNull()
    expect(detectConference("https://example.com/zoom.us/j/123")).toBeNull()
    expect(detectConference("")).toBeNull()
    expect(detectConference(null)).toBeNull()
    expect(detectConference(undefined)).toBeNull()
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
