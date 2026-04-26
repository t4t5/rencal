import type { CSSProperties } from "react"

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
  textColor: string
  backgroundColor: string
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
  const borderColor = eventColor ?? calendarColor ?? "var(--primary)"

  const boostedColor = `oklch(from ${borderColor} l calc(c * 1.4) h)`

  if (isDraft) {
    return {
      borderColor,
      textColor: `color-mix(in srgb, ${boostedColor} 60%, var(--foreground))`,
      backgroundColor: `color-mix(in srgb, ${boostedColor} 15%, var(--background))`,
    }
  }

  if (isDashed) {
    return {
      borderColor,
      textColor: `color-mix(in srgb, ${boostedColor} 50%, var(--foreground))`,
      backgroundColor: "transparent",
    }
  }

  const base = `color-mix(in srgb, ${boostedColor} 20%, var(--background))`

  return {
    borderColor,
    textColor: `color-mix(in srgb, ${boostedColor} 40%, var(--foreground))`,
    backgroundColor: highlighted ? `color-mix(in srgb, ${base} 80%, var(--foreground))` : base,
  }
}

export function getEventBlockStyle({
  calendarColor,
  eventColor,
  highlighted,
  isDashed,
  isDraft,
}: {
  calendarColor: string | null
  eventColor: string | null
  highlighted?: boolean
  isDashed?: boolean
  isDraft?: boolean
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
