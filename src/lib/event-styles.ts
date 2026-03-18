import type { CSSProperties } from "react"

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
      : `color-mix(in srgb, ${color} 30%, black)`,
    color: highlighted
      ? `color-mix(in srgb, ${color} 30%, white)`
      : `color-mix(in srgb, ${color} 70%, white)`,
  }
}
