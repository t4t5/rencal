import { rpc } from "@/rpc"
import type {
  ExternalTheme,
  ExternalThemeError,
  ExternalThemeFont,
  ExternalThemeFonts,
  ExternalThemesSnapshot,
  FontStyle,
  OmarchyColors,
} from "@/rpc/bindings"

export type {
  ExternalTheme,
  ExternalThemeError,
  ExternalThemeFont,
  ExternalThemeFonts,
  ExternalThemesSnapshot,
  FontStyle,
  OmarchyColors,
}

/** Loose and plugin themes; `external-themes-changed` reports later edits. */
export function listExternalThemes(): Promise<ExternalThemesSnapshot> {
  return rpc.themes.list_external()
}

/** Lazily read the manifest-declared WOFF2 faces owned by an installed plugin theme. */
export function loadExternalThemeFonts(themeId: string): Promise<ExternalThemeFonts> {
  return rpc.themes.load_fonts(themeId)
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

export const themes = {
  listExternal: listExternalThemes,
  loadFonts: loadExternalThemeFonts,
  getOmarchyColors,
  getConfigured: getConfiguredTheme,
  setConfigured: setConfiguredTheme,
} as const
