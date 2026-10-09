import type { MessageDescriptor } from "@lingui/core"
import { msg } from "@lingui/core/macro"

import type { ContributionKind, InstalledPlugin, InstalledPlugins, PluginCatalog } from "@/lib/api"

export type PluginListItem = {
  id: string
  name: string
  repo: string | null
  version: string | null
  description: string | null
  preview_url: string | null
  contributions: ContributionKind[]
  stars: number
  released_at: string | null
  /** In the renCal catalog. */
  listed: boolean
  installed: InstalledPlugin | null
}

/** Deep links only know the repo, so a selection is resolved against the latest lists. */
export type PluginSelection = { id: string | null; repo: string | null }

export const CONTRIBUTION_LABELS = {
  theme: msg({ message: "Theme", context: "plugin contribution kind" }),
  provider: msg({ message: "Provider", context: "plugin contribution kind" }),
} as const satisfies Record<ContributionKind, MessageDescriptor>

export function pluginOwner(plugin: PluginListItem): string {
  return plugin.repo?.split("/")[0] ?? plugin.id.split(".")[0]
}

export function isProvider(plugin: PluginListItem): boolean {
  return plugin.contributions.includes("provider")
}

/** Catalog entries enriched with their installed state, followed by local and unlisted plugins. */
export function mergePlugins(
  installed: InstalledPlugins,
  catalog: PluginCatalog | null,
): PluginListItem[] {
  const installedById = new Map(installed.plugins.map((plugin) => [plugin.id, plugin]))
  const catalogIds = new Set(catalog?.plugins.map((plugin) => plugin.id))
  return [
    ...(catalog?.plugins ?? []).map((entry) => {
      const plugin = installedById.get(entry.id)
      if (!plugin) {
        return {
          ...entry,
          version: catalogVersion(entry.tag),
          preview_url: entry.preview_url ?? null,
          contributions: entry.contributions ?? [],
          stars: entry.stars ?? 0,
          released_at: entry.released_at ?? null,
          listed: true,
          installed: null,
        }
      }
      return {
        ...plugin,
        description: entry.description ?? plugin.description,
        preview_url: entry.preview_url ?? plugin.preview_url,
        contributions: entry.contributions ?? plugin.contributions,
        stars: entry.stars ?? 0,
        released_at: entry.released_at ?? null,
        listed: true,
        installed: plugin,
      }
    }),
    ...installed.plugins
      .filter((plugin) => !catalogIds.has(plugin.id))
      .map((plugin) => ({
        ...plugin,
        stars: 0,
        released_at: null,
        listed: false,
        installed: plugin,
      })),
  ] satisfies PluginListItem[]
}

export function resolveSelection(
  plugins: PluginListItem[],
  selection: PluginSelection,
): PluginListItem {
  const repo = selection.repo?.toLowerCase()
  const match = plugins.find((plugin) =>
    selection.id ? plugin.id === selection.id : plugin.repo?.toLowerCase() === repo,
  )
  if (match) return match
  const name = selection.repo?.split("/").at(-1) ?? selection.id ?? ""
  return {
    id: selection.id ?? name,
    name,
    repo: selection.repo,
    version: null,
    description: null,
    preview_url: null,
    contributions: [],
    stars: 0,
    released_at: null,
    listed: false,
    installed: null,
  }
}

/** Releases show their tag; unreleased themes show a short commit. */
function catalogVersion(tag: string): string {
  return /^[0-9a-f]{40}$/.test(tag) ? tag.slice(0, 7) : tag
}
