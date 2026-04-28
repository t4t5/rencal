import { useMemo } from "react"

import { useCalEvents } from "@/contexts/CalEventsContext"
import { useCalendars } from "@/contexts/CalendarStateContext"

import { getCalendarColor } from "@/lib/calendar-styles"
import { enumerateLocalDateKeys } from "@/lib/event-time"

export function useEventDotsByDate(): Map<string, string[]> {
  const { calendars } = useCalendars()
  const { calendarEvents } = useCalEvents()

  return useMemo(() => {
    const colorByCalendarSlug = new Map<string, string>()
    for (const cal of calendars) {
      colorByCalendarSlug.set(cal.slug, getCalendarColor(cal))
    }

    const dotsByDate = new Map<string, string[]>()
    const slugsByDate = new Map<string, Set<string>>()

    const addDot = (dateKey: string, slug: string, color: string) => {
      const slugs = slugsByDate.get(dateKey) ?? new Set()
      if (slugs.has(slug)) return
      slugs.add(slug)
      slugsByDate.set(dateKey, slugs)

      const colors = dotsByDate.get(dateKey) ?? []
      colors.push(color)
      dotsByDate.set(dateKey, colors)
    }

    for (const event of calendarEvents) {
      const color = colorByCalendarSlug.get(event.calendar_slug)
      if (!color) continue

      for (const dateKey of enumerateLocalDateKeys(event.start, event.end)) {
        addDot(dateKey, event.calendar_slug, color)
      }
    }

    return dotsByDate
  }, [calendarEvents, calendars])
}
