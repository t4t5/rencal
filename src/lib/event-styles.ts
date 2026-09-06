import type { CSSProperties } from "react"

import { DEFAULT_CALENDAR_COLOR, withThemeEventColor } from "@/lib/calendar-styles"
import { cn } from "@/lib/utils"

export function getEventBlockClasses(highlighted: boolean, isDeclined: boolean) {
  return cn(
    "text-xs cursor-default",
    !highlighted && "hover:brightness-105",
    isDeclined && "line-through",
  )
}

interface EventBlockColors {
  /** The event's accent colour: stripes, dots and dashed outlines. */
  borderColor: string
  /** Fill of a solid event block. */
  backgroundColor: string
  /** Text placed on `backgroundColor`. */
  textColor: string
  /**
   * Accent-tinted text placed straight on the app background (no fill), e.g. the time
   * label of month-view timed events. Unlike `textColor`, a theme's `--event-foreground`
   * never replaces it.
   */
  tintedTextColor: string
}

export function getEventBlockColors({
  calendarColor,
  eventColor,
  highlighted,
  isDashed,
  isDraft = false,
}: {
  calendarColor: string | null
  eventColor: string | null
  highlighted?: boolean
  isDashed?: boolean
  isDraft?: boolean
}): EventBlockColors {
  // `calendarColor` comes from getCalendarColor(), so it already honours the theme override.
  const borderColor = eventColor
    ? withThemeEventColor(eventColor)
    : (calendarColor ?? withThemeEventColor(DEFAULT_CALENDAR_COLOR))

  const boostedColor = `oklch(from ${borderColor} l calc(c * 1.4) h)`

  if (isDraft) {
    const textColor = `color-mix(in srgb, ${boostedColor} 60%, var(--foreground))`
    return {
      borderColor,
      backgroundColor: `color-mix(in srgb, ${boostedColor} 15%, var(--background))`,
      textColor,
      tintedTextColor: textColor,
    }
  }

  if (isDashed) {
    const textColor = `color-mix(in srgb, ${boostedColor} 50%, var(--foreground))`
    return { borderColor, backgroundColor: "transparent", textColor, tintedTextColor: textColor }
  }

  const tintedTextColor = `color-mix(in srgb, ${boostedColor} 40%, var(--foreground))`

  // Themes can swap the derived tint for a solid fill via `--event-background` and
  // `--event-foreground` (see src/themes/README.md). Unset, the derived colours show through.
  const fill = `var(--event-background, color-mix(in srgb, ${boostedColor} 20%, var(--background)))`
  const textColor = `var(--event-foreground, ${tintedTextColor})`

  return {
    borderColor,
    // Highlight by mixing the fill toward its text colour. With no overrides this is the
    // original `base 80% + --foreground` formula; on a solid fill it stays clearly visible.
    backgroundColor: highlighted
      ? `color-mix(in srgb, ${fill} 80%, var(--event-foreground, var(--foreground)))`
      : fill,
    textColor,
    tintedTextColor,
  }
}

export function getEventBlockStyle({
  calendarColor,
  eventColor,
  highlighted,
  isDashed,
  isDraft,
  isDragPreview,
}: {
  calendarColor: string | null
  eventColor: string | null
  highlighted?: boolean
  isDashed?: boolean
  isDraft?: boolean
  /** Drop-position stand-in while dragging: normal fill with a solid ring in the event colour. */
  isDragPreview?: boolean
}): CSSProperties {
  const { borderColor, textColor, backgroundColor } = getEventBlockColors({
    calendarColor,
    eventColor,
    highlighted,
    isDashed,
    isDraft,
  })

  if (isDraft) {
    return {
      border: `1px dashed ${borderColor}`,
      backgroundColor,
      color: textColor,
      boxShadow: `0 0 0 2px color-mix(in srgb, ${borderColor} 25%, transparent)`,
    }
  }

  if (isDragPreview) {
    return {
      backgroundColor,
      color: textColor,
      boxShadow: `0 0 0 1.5px ${borderColor}`,
    }
  }

  if (isDashed) {
    return {
      border: `1px dashed ${borderColor}`,
      color: textColor,
    }
  }

  return {
    backgroundColor,
    color: textColor,
  }
}
