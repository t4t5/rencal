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

/** Create selections carry only their source colour; global.css paints the tint. */
export function getCreateSelectionStyle(calendarColor: string | null): CalendarEventStyle {
  return getCalendarEventStyle({ calendarColor, eventColor: null })
}
