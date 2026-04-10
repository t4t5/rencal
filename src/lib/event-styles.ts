import type { CSSProperties } from "react"

import { cn } from "@/lib/utils"

export function getEventBlockClasses(highlighted: boolean, isDeclined: boolean) {
  return cn(
    "text-xs cursor-default",
    highlighted ? "brightness-150" : "hover:brightness-110",
    isDeclined && "line-through",
  )
}

export function getEventBlockStyle(
  color: string,
  highlighted: boolean,
  isDashed: boolean,
): CSSProperties {
  if (isDashed) {
    return {
      border: `1px dashed ${color}`,
      color: `color-mix(in srgb, ${color} 70%, white)`,
    }
  }
  return {
    backgroundColor: highlighted
      ? `color-mix(in srgb, ${color} 50%, black)`
      : `color-mix(in srgb, ${color} 50%, black)`,
    color: highlighted
      ? `color-mix(in srgb, ${color} 30%, white)`
      : `color-mix(in srgb, ${color} 30%, white)`,
  }
}
