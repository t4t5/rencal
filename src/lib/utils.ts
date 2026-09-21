import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      rounded: ["rounded-circle", "rounded-base"],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const isMacOS = typeof navigator !== "undefined" && navigator.platform.startsWith("Mac")
