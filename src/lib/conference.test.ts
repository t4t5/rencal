import { describe, expect, it } from "vitest"

import type { Calendar } from "@/rpc/bindings"

import {
  calendarConferenceProvider,
  conferenceForCalendar,
  conferenceToRpc,
  detectConference,
  getMeetingUrl,
  hasVideoMeeting,
  isWithinJoinWindow,
  JOIN_LEAD_MINUTES,
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

describe("hasVideoMeeting", () => {
  it("is true for stored conferences, live or requested", () => {
    const live: EventConference = {
      status: "live",
      provider: "google",
      url: "https://meet.google.com/abc-defg-hij",
    }
    const requested: EventConference = { status: "requested", provider: "google" }

    expect(hasVideoMeeting({ conference: live, location: null })).toBe(true)
    expect(hasVideoMeeting({ conference: requested, location: null })).toBe(true)
  })

  it("is true for a meeting link in the location", () => {
    expect(hasVideoMeeting({ conference: null, location: "https://zoom.us/j/123456789" })).toBe(
      true,
    )
  })

  it("is false without a conference or meeting link", () => {
    expect(hasVideoMeeting({ conference: null, location: null })).toBe(false)
    expect(hasVideoMeeting({ conference: null, location: "Room 4B" })).toBe(false)
  })
})

describe("getMeetingUrl", () => {
  it("prefers a live conference over a link in the location", () => {
    const live: EventConference = {
      status: "live",
      provider: "google",
      url: "https://meet.google.com/abc-defg-hij",
    }

    expect(getMeetingUrl({ conference: live, location: "https://zoom.us/j/123456789" })).toBe(
      live.url,
    )
  })

  it("falls back to a meeting link in the location", () => {
    expect(getMeetingUrl({ conference: null, location: "https://zoom.us/j/123456789" })).toBe(
      "https://zoom.us/j/123456789",
    )
  })

  it("has no link for requested conferences or plain locations", () => {
    const requested: EventConference = { status: "requested", provider: "google" }

    expect(getMeetingUrl({ conference: requested, location: null })).toBeNull()
    expect(getMeetingUrl({ conference: null, location: "Room 4B" })).toBeNull()
  })
})

describe("isWithinJoinWindow", () => {
  const minute = 60_000
  const dateInfo = { startMs: 100 * minute, endMs: 130 * minute }

  it("opens the lead time before the start and stays open until the end", () => {
    const opensAt = dateInfo.startMs - JOIN_LEAD_MINUTES * minute

    expect(isWithinJoinWindow(dateInfo, opensAt - 1)).toBe(false)
    expect(isWithinJoinWindow(dateInfo, opensAt)).toBe(true)
    expect(isWithinJoinWindow(dateInfo, dateInfo.startMs)).toBe(true)
    expect(isWithinJoinWindow(dateInfo, dateInfo.endMs - 1)).toBe(true)
    expect(isWithinJoinWindow(dateInfo, dateInfo.endMs)).toBe(false)
  })
})
