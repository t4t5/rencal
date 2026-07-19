import { describe, expect, it } from "vitest"

import { orderAccountProviders } from "./providers"

describe("orderAccountProviders", () => {
  it("puts core providers first and CalDAV last", () => {
    expect(
      orderAccountProviders([
        "atproto",
        "etesync",
        "google",
        "icloud",
        "outlook",
        "proton",
        "rensync",
        "tuta",
        "caldav",
      ]),
    ).toEqual([
      "google",
      "icloud",
      "outlook",
      "atproto",
      "etesync",
      "proton",
      "rensync",
      "tuta",
      "caldav",
    ])
  })

  it("preserves the discovered-provider order and handles missing core providers", () => {
    expect(orderAccountProviders(["tuta", "caldav", "proton", "google"])).toEqual([
      "google",
      "tuta",
      "proton",
      "caldav",
    ])
  })
})
