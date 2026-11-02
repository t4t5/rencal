import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from "react"

import { api, type InstalledPlugins } from "@/lib/api"

const countUpdates = (installed: InstalledPlugins) =>
  installed.plugins.filter((plugin) => plugin.update_version).length

const PluginUpdatesContext = createContext<{
  count: number
  report: (installed: InstalledPlugins) => void
} | null>(null)

/** Counts plugin updates for the Settings sidebar; the Plugins page reports newer lists. */
export function PluginUpdatesProvider({ children }: { children: ReactNode }) {
  const [count, setCount] = useState(0)
  const report = useCallback((installed: InstalledPlugins) => setCount(countUpdates(installed)), [])

  useEffect(() => {
    let cancelled = false
    // List after the catalog: the backend finds updates against the catalog it fetched.
    api.plugins
      .catalog()
      .then(() => api.plugins.list())
      .then((installed) => {
        if (!cancelled) report(installed)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [report])

  return <PluginUpdatesContext value={{ count, report }}>{children}</PluginUpdatesContext>
}

export const usePluginUpdateCount = () => useContext(PluginUpdatesContext)?.count ?? 0

const noReport = () => {}

export const useReportPluginUpdates = () => useContext(PluginUpdatesContext)?.report ?? noReport
