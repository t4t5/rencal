import { rpc } from "@/rpc"
import type { PluginInspection, PluginThemeInspection } from "@/rpc/bindings"

export type { PluginInspection, PluginThemeInspection }

/** Resolve and validate the latest stable release for an install review. */
export function inspectPlugin(repo: string): Promise<PluginInspection> {
  return rpc.plugins.inspect(repo)
}

/** Install or update a package from its latest stable release. */
export function installPlugin(repo: string): Promise<PluginInspection> {
  return rpc.plugins.install(repo)
}

export async function uninstallPlugin(id: string): Promise<void> {
  await rpc.plugins.uninstall(id)
}

export const plugins = {
  inspect: inspectPlugin,
  install: installPlugin,
  uninstall: uninstallPlugin,
} as const
