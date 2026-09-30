import type { ContributionKind, InstalledPlugin } from "@/lib/api"

export type PluginListItem = {
  id: string
  name: string
  repo: string | null
  version: string | null
  description: string | null
  preview_url: string | null
  contributions: ContributionKind[]
  /** In the renCal catalog. */
  listed: boolean
  installed: InstalledPlugin | null
}

export const CONTRIBUTION_LABELS = {
  theme: "Theme",
  provider: "Provider",
} as const satisfies Record<ContributionKind, string>

export function pluginOwner(plugin: PluginListItem): string {
  return plugin.repo?.split("/")[0] ?? plugin.id.split(".")[0]
}

export function isProvider(plugin: PluginListItem): boolean {
  return plugin.contributions.includes("provider")
}
