import { Calendar } from "@/rpc/bindings"

export const DEFAULT_CALENDAR_COLOR = "var(--primary)"

/** Lets a theme's `--event-color` override every event colour (see themes/README.md). */
export const withThemeEventColor = (color: string) => `var(--event-color, ${color})`

export const getCalendarColor = (calendar: Calendar | undefined) => {
  return withThemeEventColor(calendar?.color ?? DEFAULT_CALENDAR_COLOR)
}
