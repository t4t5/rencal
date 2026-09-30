import type { InstalledPlugin } from "@/lib/api"

export type PluginListItem = {
  id: string
  name: string
  repo: string | null
  version: string | null
  description: string | null
  preview_url: string | null
  /** From the catalog: the plugin ships a calendar provider binary. */
  provider: boolean
  installed: InstalledPlugin | null
}

export function pluginOwner(plugin: PluginListItem): string {
  return plugin.repo?.split("/")[0] ?? plugin.id.split(".")[0]
}
