import type { CSSProperties } from "react"

import { DEFAULT_CALENDAR_COLOR, withThemeEventColor } from "@/lib/calendar-styles"

type CalendarEventStyle = CSSProperties & {
  "--calendar-event-color": string
}

function getCalendarEventColor(calendarColor: string | null, eventColor: string | null): string {
  // `calendarColor` comes from getCalendarColor(), so it already honours the theme override.
  return eventColor
    ? withThemeEventColor(eventColor)
    : (calendarColor ?? withThemeEventColor(DEFAULT_CALENDAR_COLOR))
}

/**
 * The only event paint written inline is its source colour. Themeable paint is
 * derived from this property in global.css; layout components keep geometry in
 * their own inline styles.
 */
export function getCalendarEventStyle({
  calendarColor,
  eventColor,
}: {
  calendarColor: string | null
  eventColor: string | null
}): CalendarEventStyle {
  return {
    "--calendar-event-color": getCalendarEventColor(calendarColor, eventColor),
  }
}

/** Flat tint used while drawing a new event range. */
export function getCreateSelectionStyle(calendarColor: string | null): CSSProperties {
  const accent = calendarColor ?? withThemeEventColor(DEFAULT_CALENDAR_COLOR)
  const boostedAccent = `oklch(from ${accent} l calc(c * 1.4) h)`
  return {
    backgroundColor: `color-mix(in srgb, ${boostedAccent} 20%, transparent)`,
  }
}
