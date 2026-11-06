/* Counts plugin updates for the Settings sidebar; the Plugins page reports newer lists. */
import { signal } from "nsh"

import { api, type InstalledPlugins } from "@/lib/api"

const count = signal(0)

export const pluginUpdateCount = () => count()

export const reportPluginUpdates = (installed: InstalledPlugins) =>
  count.set(installed.plugins.filter((plugin) => plugin.update_version).length)

/** List after the catalog: the backend finds updates against the catalog it fetched. */
export function checkPluginUpdates() {
  api.plugins
    .catalog()
    .then(() => api.plugins.list())
    .then(reportPluginUpdates)
    .catch(() => {})
}
