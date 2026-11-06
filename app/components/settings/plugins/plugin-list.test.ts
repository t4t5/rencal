import type { InstalledPlugin, InstalledPlugins, PluginCatalog } from "@/lib/api"
import { describe, expect, it } from "@/lib/testing/vitest"

import {
  mergePlugins,
  pluginCount,
  pluginOwner,
  resolveSelection,
  visiblePlugins,
} from "./plugin-list"

const installedPlugin = (overrides: Partial<InstalledPlugin>): InstalledPlugin =>
  ({
    id: "t4t5.dracula",
    name: "Dracula",
    repo: "t4t5/rencal-theme-dracula",
    version: "1.0.0",
    description: null,
    preview_url: null,
    contributions: ["theme"],
    local_dir: null,
    update_version: null,
    error: null,
    ...overrides,
  }) as InstalledPlugin

const installed = (...plugins: InstalledPlugin[]): InstalledPlugins =>
  ({ plugins, errors: [] }) as InstalledPlugins

const catalog = (entries: Record<string, unknown>[]): PluginCatalog =>
  ({ plugins: entries, error: null }) as unknown as PluginCatalog

const entry = (id: string, name: string, stars: number, released_at: string | null = null) => ({
  id,
  name,
  repo: `t4t5/${id}`,
  tag: "v1.0.0",
  description: `${name} description`,
  stars,
  released_at,
})

describe("mergePlugins", () => {
  it("enriches catalog entries with their install, and keeps unlisted plugins", () => {
    const merged = mergePlugins(
      installed(installedPlugin({}), installedPlugin({ id: "local.theme", name: "Local" })),
      catalog([entry("t4t5.dracula", "Dracula", 5), entry("other", "Other", 1)]),
    )
    expect(merged.map((plugin) => plugin.id)).toEqual(["t4t5.dracula", "other", "local.theme"])
    expect(merged[0]!.listed).toBe(true)
    expect(merged[0]!.installed?.version).toBe("1.0.0")
    expect(merged[1]!.installed).toBeNull()
    expect(merged[2]!.listed).toBe(false)
  })
})

describe("resolveSelection", () => {
  it("finds a deep link's repo in any case, and makes up a plugin for one it can't find", () => {
    const merged = mergePlugins(installed(installedPlugin({})), null)
    const repo = "T4T5/Rencal-Theme-Dracula"
    expect(resolveSelection(merged, { id: null, repo }).id).toBe("t4t5.dracula")
    expect(resolveSelection(merged, { id: null, repo: "a/new-theme" }).name).toBe("new-theme")
  })
})

describe("visiblePlugins", () => {
  const merged = mergePlugins(
    installed(installedPlugin({ update_version: "2.0.0" })),
    catalog([
      entry("t4t5.dracula", "Dracula", 1, "2026-01-01"),
      entry("b", "Bravo", 9, "2025-01-01"),
      entry("c", "Charlie", 5, "2026-06-01"),
    ]),
  )
  const ids = (list: ReturnType<typeof visiblePlugins>) => list.map((plugin) => plugin.id)

  it("puts updates first, then sorts by stars or date", () => {
    expect(ids(visiblePlugins(merged, "", false, "stars"))).toEqual(["t4t5.dracula", "b", "c"])
    expect(ids(visiblePlugins(merged, "", false, "latest"))).toEqual(["t4t5.dracula", "c", "b"])
  })

  it("filters by text and by being installed", () => {
    expect(ids(visiblePlugins(merged, "charlie desc", false, "stars"))).toEqual(["c"])
    expect(ids(visiblePlugins(merged, "", true, "stars"))).toEqual(["t4t5.dracula"])
  })
})

describe("labels", () => {
  it("counts plugins", () => {
    expect(pluginCount(1, 1)).toBe("1 plugin")
    expect(pluginCount(2, 8)).toBe("2 of 8 plugins")
  })

  it("takes the owner from the repo, else the id", () => {
    const [plugin] = mergePlugins(installed(installedPlugin({ repo: null })), null)
    expect(pluginOwner(plugin!)).toBe("t4t5")
  })
})
