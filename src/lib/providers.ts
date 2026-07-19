import { IconType } from "@/lib/types"

import { AppleIcon } from "@/icons/apple"
import { EtesyncIcon } from "@/icons/etesync"
import { GoogleIcon } from "@/icons/google"
import { MicrosoftIcon } from "@/icons/microsoft"
import { ProtonIcon } from "@/icons/proton-logo"
import { TutaIcon } from "@/icons/tuta"

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
  google: GoogleIcon,
  icloud: AppleIcon,
  outlook: MicrosoftIcon,
  proton: ProtonIcon,
  tuta: TutaIcon,
  etesync: EtesyncIcon,
}

export const getProviderIcon = (name: string | null): IconType | null => {
  if (!name) return null
  return providerToIcon[name] ?? null
}

const providersWithoutAccount = new Set(["webcal"])

export const providerRequiresAccount = (name: string) => !providersWithoutAccount.has(name)
