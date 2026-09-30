import { rpc } from "@/rpc"
import type {
  ContributionKind,
  InstalledPlugin,
  InstalledPlugins,
  PluginCatalog,
  PluginCatalogEntry,
  PluginInspection,
  PluginInstallLink,
} from "@/rpc/bindings"

export type {
  ContributionKind,
  InstalledPlugin,
  InstalledPlugins,
  PluginCatalog,
  PluginCatalogEntry,
  PluginInspection,
  PluginInstallLink,
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
  install: installPlugin,
  uninstall: uninstallPlugin,
} as const
