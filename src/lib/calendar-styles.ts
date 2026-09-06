import { Calendar } from "@/rpc/bindings"

export const DEFAULT_CALENDAR_COLOR = "var(--primary)"

/**
 * Themes can set `--event-color` to paint every event in a single colour
 * (see src/themes/README.md). It's unset by default, so `color` shows through.
 */
export const withThemeEventColor = (color: string) => `var(--event-color, ${color})`

export const getCalendarColor = (calendar: Calendar | undefined) => {
  return withThemeEventColor(calendar?.color ?? DEFAULT_CALENDAR_COLOR)
}
