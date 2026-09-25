import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

const twMerge = extendTailwindMerge({
  extend: {
    // Custom --spacing-* tokens, so e.g. h-4 overrides h-control
    theme: {
      spacing: ["control", "control-xs", "control-sm", "control-lg"],
    },
    classGroups: {
      rounded: ["rounded-circle"],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const isMacOS = typeof navigator !== "undefined" && navigator.platform.startsWith("Mac")
