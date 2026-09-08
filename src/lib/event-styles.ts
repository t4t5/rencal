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
  borderColor: string
  backgroundColor: string
  textColor: string
  /** Tinted text on the bare app background; never replaced by `--event-foreground`. */
  tintedTextColor: string
}

// Chroma-boosted accent mixed into --foreground. Light themes override the tokens in
// global.css (no mix, capped lightness) so the accent doesn't turn muddy.
function tintText(accent: string, foregroundMix: number) {
  const tinted = `oklch(from ${accent} min(l, var(--event-text-max-lightness, 1)) calc(c * var(--event-text-chroma, 1.4)) h)`
  return `color-mix(in srgb, var(--foreground) var(--event-text-foreground-mix, ${foregroundMix}%), ${tinted})`
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
    const textColor = tintText(borderColor, 40)
    return {
      borderColor,
      backgroundColor: `color-mix(in srgb, ${boostedColor} 15%, var(--background))`,
      textColor,
      tintedTextColor: textColor,
    }
  }

  if (isDashed) {
    const textColor = tintText(borderColor, 50)
    return { borderColor, backgroundColor: "transparent", textColor, tintedTextColor: textColor }
  }

  const tintedTextColor = tintText(borderColor, 60)

  // Themes can replace the derived tint with a solid fill (see themes/README.md).
  const fill = `var(--event-background, color-mix(in srgb, ${boostedColor} 20%, var(--background)))`
  const textColor = `var(--event-foreground, ${tintedTextColor})`

  return {
    borderColor,
    // Mix the fill toward its text colour so the highlight also shows on solid fills.
    backgroundColor: highlighted
      ? `color-mix(in srgb, ${fill} 80%, var(--event-foreground, var(--foreground)))`
      : fill,
    textColor,
    tintedTextColor,
  }
}

/** Flat tint used while drawing a new event range over the week time grid. */
export function getCreateSelectionStyle(calendarColor: string | null): CSSProperties {
  const accent = calendarColor ?? withThemeEventColor(DEFAULT_CALENDAR_COLOR)
  const boostedAccent = `oklch(from ${accent} l calc(c * 1.4) h)`
  return {
    backgroundColor: `color-mix(in srgb, ${boostedAccent} 20%, transparent)`,
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
