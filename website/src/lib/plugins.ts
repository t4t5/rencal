import fs from "node:fs/promises"

export interface PluginIndexEntry {
  id: string
  name: string
  repo: string
  description: string
  stars: number
  released_at: string
  contributions: string[]
  preview_url?: string
}

function isPluginIndexEntry(value: unknown): value is PluginIndexEntry {
  if (typeof value !== "object" || value === null) return false
  const entry = value as Record<string, unknown>
  return (
    (entry.preview_url === undefined ||
      (typeof entry.preview_url === "string" &&
        /^https:\/\/rencal\.org\/plugin-previews\/[0-9a-f]{64}\.png$/.test(entry.preview_url))) &&
    typeof entry.id === "string" &&
    // Plugin ids are `<owner>.<name>` slugs, so they are safe as a URL path segment.
    /^[a-z0-9-]+\.[a-z0-9-]+$/.test(entry.id) &&
    typeof entry.name === "string" &&
    typeof entry.repo === "string" &&
    typeof entry.description === "string" &&
    typeof entry.stars === "number" &&
    typeof entry.released_at === "string" &&
    Array.isArray(entry.contributions) &&
    entry.contributions.every((kind) => typeof kind === "string")
  )
}

/** The plugin index, most-starred first. */
export async function loadPlugins(): Promise<PluginIndexEntry[]> {
  // `just web` renders mock plugins so the grid can be previewed locally.
  const indexPath = import.meta.env.DEV ? "src/data/mock-plugins.json" : "public/plugins.json"
  const rawIndex: unknown = JSON.parse(await fs.readFile(indexPath, "utf8"))
  if (!Array.isArray(rawIndex) || !rawIndex.every(isPluginIndexEntry)) {
    throw new Error(`${indexPath} is not a valid plugin index`)
  }
  return rawIndex.sort(
    (left, right) =>
      right.stars - left.stars ||
      left.name.localeCompare(right.name, undefined, { sensitivity: "base" }),
  )
}
