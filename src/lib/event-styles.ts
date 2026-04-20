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
  color: string,
  highlighted: boolean,
  isDashed: boolean,
  isDraft: boolean = false,
): CSSProperties {
  const boosted = `oklch(from ${color} l calc(c * 1.4) h)`

  if (isDraft) {
    return {
      border: `1px dashed ${boosted}`,
      backgroundColor: `color-mix(in srgb, ${boosted} 15%, var(--background))`,
      color: `color-mix(in srgb, ${boosted} 60%, var(--foreground))`,
      boxShadow: `0 0 0 2px color-mix(in srgb, ${boosted} 25%, transparent)`,
    }
  }

  if (isDashed) {
    return {
      border: `1px dashed ${boosted}`,
      color: `color-mix(in srgb, ${boosted} 50%, var(--foreground))`,
    }
  }

  const base = `color-mix(in srgb, ${boosted} 20%, var(--background))`

  return {
    backgroundColor: highlighted ? `color-mix(in srgb, ${base} 80%, var(--foreground))` : base,
    color: `color-mix(in srgb, ${boosted} 40%, var(--foreground))`,
  }
}
