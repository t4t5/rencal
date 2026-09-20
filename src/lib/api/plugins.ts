import { rpc } from "@/rpc"
import type {
  InstalledPlugin,
  InstalledPlugins,
  PluginCatalog,
  PluginCatalogEntry,
  PluginInspection,
  PluginInstallLink,
  PluginThemeInspection,
} from "@/rpc/bindings"

export type {
  InstalledPlugin,
  InstalledPlugins,
  PluginCatalog,
  PluginCatalogEntry,
  PluginInspection,
  PluginInstallLink,
  PluginThemeInspection,
}

/** Resolve and validate the latest release or default-branch package. */
export function inspectPlugin(repo: string): Promise<PluginInspection> {
  return rpc.plugins.inspect(repo)
}

/** Install or update a package from its latest release or default branch. */
export function installPlugin(repo: string): Promise<PluginInspection> {
  return rpc.plugins.install(repo)
}

export async function uninstallPlugin(id: string): Promise<void> {
  await rpc.plugins.uninstall(id)
}

export const plugins = {
  list: (): Promise<InstalledPlugins> => rpc.plugins.list(),
  catalog: (): Promise<PluginCatalog> => rpc.plugins.catalog(),
  takePendingInstall: (): Promise<PluginInstallLink | null> =>
    rpc.platform.take_pending_plugin_install(),
  inspect: inspectPlugin,
  install: installPlugin,
  uninstall: uninstallPlugin,
} as const
