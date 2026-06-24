import type { Calendar } from "@/rpc/bindings"

export const DEFAULT_GROUP = "default"
export const ACTIVE_GROUP_KEY = "activeGroup"

export type CalendarGroups = Record<string, string[]>

export function normalizeCalendarGroups(groups: Partial<Record<string, string[]>>): CalendarGroups {
  return Object.fromEntries(
    Object.entries(groups).filter((entry): entry is [string, string[]] => Array.isArray(entry[1])),
  )
}

export function getStoredActiveGroup(storage: Storage): string {
  const item = storage.getItem(ACTIVE_GROUP_KEY)
  if (item === null) return DEFAULT_GROUP

  try {
    const parsed: unknown = JSON.parse(item)
    return typeof parsed === "string" ? parsed : DEFAULT_GROUP
  } catch {
    return DEFAULT_GROUP
  }
}

export function getVisibleCalendarSlugs({
  calendars,
  groups,
  activeGroup,
}: {
  calendars: Pick<Calendar, "slug">[]
  groups: CalendarGroups
  activeGroup: string
}): string[] {
  const allSlugs = calendars.map((c) => c.slug)
  const groupSlugs = groups[activeGroup]

  // Default group with no explicit override, or an unknown group name: show everything.
  if (groupSlugs === undefined) return allSlugs

  // Filter against real calendars so stale/typo slugs in config are ignored.
  const allowed = new Set(groupSlugs)
  return allSlugs.filter((slug) => allowed.has(slug))
}
