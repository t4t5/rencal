import type { CSSProperties } from "react"

import { cn } from "@/lib/utils"

export function getEventBlockClasses(highlighted: boolean, isDeclined: boolean) {
  return cn(
    "text-xs cursor-default",
    !highlighted && "hover:brightness-105",
    isDeclined && "line-through",
  )
}

export function getEventBlockStyle(
  calendarColor: string,
  eventColor: string | null,
  highlighted: boolean,
  isDashed: boolean,
  isDraft: boolean = false,
): CSSProperties {
  const boostedCalendar = `oklch(from ${calendarColor} l calc(c * 1.4) h)`
  const fillSource = eventColor ?? calendarColor
  const boostedFill = `oklch(from ${fillSource} l calc(c * 1.4) h)`

  if (isDraft) {
    return {
      border: `1px dashed ${boostedCalendar}`,
      backgroundColor: `color-mix(in srgb, ${boostedFill} 15%, var(--background))`,
      color: `color-mix(in srgb, ${boostedFill} 60%, var(--foreground))`,
      boxShadow: `0 0 0 2px color-mix(in srgb, ${boostedCalendar} 25%, transparent)`,
    }
  }

  if (isDashed) {
    return {
      border: `1px dashed ${boostedCalendar}`,
      color: `color-mix(in srgb, ${boostedFill} 50%, var(--foreground))`,
    }
  }

  const base = `color-mix(in srgb, ${boostedFill} 20%, var(--background))`

  return {
    backgroundColor: highlighted ? `color-mix(in srgb, ${base} 80%, var(--foreground))` : base,
    color: `color-mix(in srgb, ${boostedFill} 40%, var(--foreground))`,
  }
}
