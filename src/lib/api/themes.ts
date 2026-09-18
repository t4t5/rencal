import { rpc } from "@/rpc"
import type { ExternalTheme, OmarchyColors } from "@/rpc/bindings"

export type { ExternalTheme, OmarchyColors }

/** User themes from the themes directory; `external-themes-changed` reports later edits. */
export function listExternalThemes(): Promise<ExternalTheme[]> {
  return rpc.themes.list_external()
}

/** The active Omarchy palette, or null when Omarchy is not installed. */
export function getOmarchyColors(): Promise<OmarchyColors | null> {
  return rpc.omarchy.get_colors()
}

/** The theme id persisted in config.toml, or null when none has been written yet. */
export function getConfiguredTheme(): Promise<string | null> {
  return rpc.config.get_theme()
}

export async function setConfiguredTheme(theme: string): Promise<void> {
  await rpc.config.set_theme(theme)
}
