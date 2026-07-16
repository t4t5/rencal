import type { Contact } from "@/rpc/bindings"

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function suggestContacts(
  contacts: Contact[],
  query: string,
  excludeEmails: Iterable<string>,
  limit = 8,
): Contact[] {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) return []

  const excluded = new Set(Array.from(excludeEmails, normalizeEmail).filter(Boolean))

  return contacts
    .map((contact, index) => ({
      contact,
      index,
      rank: matchRank(contact, normalizedQuery),
    }))
    .filter(
      (item): item is { contact: Contact; index: number; rank: number } =>
        item.rank !== null &&
        isValidContactEmail(item.contact.email) &&
        !excluded.has(normalizeEmail(item.contact.email)),
    )
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .slice(0, limit)
    .map((item) => item.contact)
}

function matchRank(contact: Contact, query: string): number | null {
  const email = contact.email.toLowerCase()
  const name = contact.name?.toLowerCase() ?? ""

  if (email.startsWith(query) || nameWords(name).some((word) => word.startsWith(query))) {
    return 0
  }

  if (email.includes(query) || name.includes(query)) {
    return 1
  }

  return null
}

function nameWords(name: string): string[] {
  return name.split(/\s+/).filter(Boolean)
}

export function isValidContactEmail(email: string): boolean {
  return EMAIL_RE.test(normalizeEmail(email))
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}
