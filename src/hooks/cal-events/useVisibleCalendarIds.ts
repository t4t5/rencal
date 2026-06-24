import { useMemo } from "react"

import { useCalendars } from "@/contexts/CalendarStateContext"
import { useSettings } from "@/contexts/SettingsContext"

import { getVisibleCalendarSlugs } from "@/lib/calendar-groups"

/**
 * The calendar slugs whose events should be loaded and shown. Single source of truth
 * for every event-loading path (month grid, agenda, jump navigation, initial load).
 *
 * The active group (app state) selects which calendars are visible. The "default"
 * group shows all calendars unless config.toml defines an explicit `default` group.
 * A group naming slugs that don't exist is fine — they're ignored.
 */
export function useVisibleCalendarIds(): string[] {
  const { calendars, activeGroup } = useCalendars()
  const { groups, settingsLoaded } = useSettings()

  return useMemo(() => {
    // Wait for config-backed groups before filtering, so we don't briefly load
    // events for calendars a non-default group will hide.
    if (!settingsLoaded) return []

    return getVisibleCalendarSlugs({ calendars, groups, activeGroup })
  }, [calendars, groups, activeGroup, settingsLoaded])
}
