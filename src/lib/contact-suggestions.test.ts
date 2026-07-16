import { describe, expect, it } from "vitest"

import type { Contact } from "@/rpc/bindings"

import { suggestContacts } from "./contact-suggestions"

const contacts: Contact[] = [
  contact("zara@example.com", "Zara Zee", 10),
  contact("alex@example.com", "Jordan Smith", 8),
  contact("sam@example.com", "Alex Cooper", 6),
  contact("person-alex@example.com", "Casey Example", 4),
]

describe("suggestContacts", () => {
  it("returns no suggestions for an empty query", () => {
    expect(suggestContacts(contacts, "", [])).toEqual([])
    expect(suggestContacts(contacts, "   ", [])).toEqual([])
  })

  it("ranks email and name-word prefixes before substrings", () => {
    expect(suggestContacts(contacts, "alex", []).map((c) => c.email)).toEqual([
      "alex@example.com",
      "sam@example.com",
      "person-alex@example.com",
    ])
  })

  it("excludes already-used emails case-insensitively", () => {
    expect(
      suggestContacts(contacts, "@example", [" ALEX@example.com "]).map((c) => c.email),
    ).toEqual(["zara@example.com", "sam@example.com", "person-alex@example.com"])
  })

  it("filters invalid email-like contact values", () => {
    const contactsWithInvalidEmail = [
      contact("tristan@example.com", "Tristan", 10),
      contact("/andm3ndgynjj5ndm3ndgynkmkgsbdxwst...", "Tristan", 8),
    ]

    expect(suggestContacts(contactsWithInvalidEmail, "tristan", []).map((c) => c.email)).toEqual([
      "tristan@example.com",
    ])
  })

  it("keeps backend order within the same rank and respects limit", () => {
    expect(suggestContacts(contacts, "@example", [], 2).map((c) => c.email)).toEqual([
      "zara@example.com",
      "alex@example.com",
    ])
  })
})

function contact(email: string, name: string, count: number): Contact {
  return { email, name, count, last_seen: "2026-01-01" }
}
