import type { ContributionKind, InstalledPlugin } from "@/lib/api"

export type PluginListItem = {
  id: string
  name: string
  repo: string | null
  version: string | null
  description: string | null
  preview_url: string | null
  /** From the catalog; `null` when the plugin isn't listed. */
  contributions: ContributionKind[] | null
  installed: InstalledPlugin | null
}

export const CONTRIBUTION_LABELS = {
  theme: "Theme",
  provider: "Calendar provider",
} as const satisfies Record<ContributionKind, string>

export function pluginOwner(plugin: PluginListItem): string {
  return plugin.repo?.split("/")[0] ?? plugin.id.split(".")[0]
}

export function isProvider(plugin: PluginListItem): boolean {
  return plugin.contributions?.includes("provider") ?? false
}
