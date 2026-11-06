import { platform } from "nsh"

type ClassValue = string | false | null | undefined

// NSH applies classes in order, so a later class already wins and needs no merging.
export function cn(...inputs: ClassValue[]) {
  return inputs.filter(Boolean).join(" ")
}

export const isMacOS = platform.os === "macos"
