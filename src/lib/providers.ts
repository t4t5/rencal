import { Google, Microsoft, Apple } from "@lobehub/icons"
import { IoCalendar as CalendarIcon } from "react-icons/io5"
import { IconType } from "react-icons/lib"

export const providerDisplayName: Record<string, string> = {
  google: "Google",
  icloud: "iCloud",
  outlook: "Outlook",
  caldav: "CalDAV",
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export const getProviderDisplayName = (name: string | null) => {
  if (!name) return "Unknown"
  return providerDisplayName[name] || capitalize(name)
}

export const providerToIcon: Record<string, IconType> = {
  google: Google.Color,
  icloud: Apple,
  outlook: Microsoft.Color,
}

export const getProviderIcon = (name: string | null) => {
  if (!name) return CalendarIcon
  return providerToIcon[name] ?? CalendarIcon
}
