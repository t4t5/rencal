import { describe, expect, it } from "vitest"

import { detectEventUrl, findUrls, toOpenableUrl } from "@/lib/event-url"

describe("toOpenableUrl", () => {
  it("prefixes scheme-less links with https", () => {
    expect(toOpenableUrl("example.com")).toBe("https://example.com")
    expect(toOpenableUrl("www.example.com/path")).toBe("https://www.example.com/path")
  })

  it("keeps links that already have a scheme", () => {
    expect(toOpenableUrl("http://example.com")).toBe("http://example.com")
    expect(toOpenableUrl("mailto:someone@example.com")).toBe("mailto:someone@example.com")
  })
})

describe("findUrls", () => {
  it("returns nothing for empty text", () => {
    expect(findUrls(null)).toEqual([])
    expect(findUrls(undefined)).toEqual([])
    expect(findUrls("")).toEqual([])
    expect(findUrls("no links here")).toEqual([])
  })

  it("finds http(s) and www links in order of appearance", () => {
    expect(findUrls("See https://a.example/x then http://b.example and www.c.example")).toEqual([
      "https://a.example/x",
      "http://b.example",
      "www.c.example",
    ])
  })

  it("does not treat 'www.' inside a word as a link", () => {
    expect(findUrls("foowww.example.com")).toEqual([])
  })

  it("strips punctuation that trails a link in prose", () => {
    expect(findUrls("Tickets: https://example.com/tickets.")).toEqual([
      "https://example.com/tickets",
    ])
    expect(findUrls("(more at https://example.com/info).")).toEqual(["https://example.com/info"])
    expect(findUrls("Really? https://example.com/?q=1!")).toEqual(["https://example.com/?q=1"])
  })

  it("keeps balanced brackets that are part of the link", () => {
    expect(findUrls("Read https://en.wikipedia.org/wiki/Foo_(bar) first")).toEqual([
      "https://en.wikipedia.org/wiki/Foo_(bar)",
    ])
    expect(findUrls("(Read https://en.wikipedia.org/wiki/Foo_(bar))")).toEqual([
      "https://en.wikipedia.org/wiki/Foo_(bar)",
    ])
  })

  it("stops at HTML markup and quotes", () => {
    expect(findUrls('<a href="https://example.com/page">https://example.com/page</a>')).toEqual([
      "https://example.com/page",
      "https://example.com/page",
    ])
  })
})

describe("detectEventUrl", () => {
  const event = (overrides: Partial<Parameters<typeof detectEventUrl>[0]>) => ({
    url: null,
    description: null,
    location: null,
    conference: null,
    ...overrides,
  })

  it("returns null when the event has no links", () => {
    expect(detectEventUrl(event({ description: "Bring snacks", location: "Kitchen" }))).toBeNull()
  })

  it("finds a link in the notes", () => {
    expect(
      detectEventUrl(event({ description: "Flight details: https://www.flighty.app/" })),
    ).toEqual({ url: "https://www.flighty.app/", source: "description" })
  })

  it("prefers a link in the location over one in the notes", () => {
    expect(
      detectEventUrl(
        event({ location: "https://venue.example/map", description: "https://other.example" }),
      ),
    ).toEqual({ url: "https://venue.example/map", source: "location" })
  })

  it("skips a link that matches the explicit URL field", () => {
    expect(
      detectEventUrl(
        event({
          url: "example.com/a",
          description: "https://example.com/a and https://example.com/b",
        }),
      ),
    ).toEqual({ url: "https://example.com/b", source: "description" })
  })

  it("skips the event's meeting link", () => {
    const meet = "https://meet.google.com/abc-defg-hij"

    expect(
      detectEventUrl(
        event({
          conference: { status: "live", provider: "google", url: meet },
          description: `Join with Google Meet: ${meet}?hs=122 Agenda: https://docs.example/agenda`,
        }),
      ),
    ).toEqual({ url: "https://docs.example/agenda", source: "description" })

    expect(detectEventUrl(event({ location: "https://us02web.zoom.us/j/123456789" }))).toBeNull()
  })

  it("still surfaces a meeting link when the event has no video meeting", () => {
    expect(
      detectEventUrl(event({ location: "Room 4", description: "https://meet.jit.si/standup" })),
    ).toEqual({ url: "https://meet.jit.si/standup", source: "description" })
  })
})
