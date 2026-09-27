import type { ProviderInfo } from "@/lib/api"
import { IconType } from "@/lib/types"

import { AppleIcon } from "@/icons/providers/apple"
import { EtesyncIcon } from "@/icons/providers/etesync"
import { GoogleIcon } from "@/icons/providers/google"
import { MicrosoftIcon } from "@/icons/providers/microsoft"
import { ProtonIcon } from "@/icons/providers/proton"

const providerDisplayName: Record<string, string> = {
  google: "Google",
  icloud: "iCloud",
  outlook: "Outlook",
  caldav: "CalDAV",
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export const findProvider = (providers: ProviderInfo[], slug: string | null) =>
  providers.find((provider) => provider.slug === slug)

/** A plugin's manifest name wins over renCal's built-in names. */
export const getProviderDisplayName = (name: string | null, info?: ProviderInfo) => {
  if (!name) return "Unknown"
  return info?.name ?? providerDisplayName[name] ?? capitalize(name)
}

const providerToIcon: Record<string, IconType> = {
  google: GoogleIcon,
  icloud: AppleIcon,
  outlook: MicrosoftIcon,
  proton: ProtonIcon,
  etesync: EtesyncIcon,
}

export const getProviderIcon = (name: string | null): IconType | null => {
  if (!name) return null
  return providerToIcon[name] ?? null
}

/** Syncing needs renCal: the caldir CLI only finds providers on `PATH`. */
export const syncsOnlyInRencal = (info: ProviderInfo | undefined) =>
  info?.source.kind === "plugin" && !info.on_path

const providersWithoutAccount = new Set(["webcal"])

export const providerRequiresAccount = (name: string) => !providersWithoutAccount.has(name)

const coreAccountProviders = ["google", "icloud", "outlook"]
const fallbackAccountProvider = "caldav"

export const orderAccountProviders = (providers: string[]) => {
  const available = new Set(providers)
  const core = coreAccountProviders.filter((provider) => available.has(provider))
  const discovered = providers.filter(
    (provider) => !coreAccountProviders.includes(provider) && provider !== fallbackAccountProvider,
  )
  const fallback = available.has(fallbackAccountProvider) ? [fallbackAccountProvider] : []

  return [...core, ...discovered, ...fallback]
}
