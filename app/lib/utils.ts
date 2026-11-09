import { platform } from "nsh"

type ClassValue = string | false | null | undefined

// NSH applies classes in order, so a later class already wins and needs no merging.
export function cn(...inputs: ClassValue[]) {
  return inputs.filter(Boolean).join(" ")
}

// Inset, so cells that clip their content still show it.
export const FOCUS_RING =
  "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"

export const isMacOS = platform.os === "macos"
