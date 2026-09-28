import type { ThemeSetting } from "@/lib/api"

export type Appearance = "light" | "dark"

// `appearance: null` means the theme's appearance is derived at runtime
// (e.g. omarchy, which inherits from the OS theme).
export const themes = [
  { id: "omarchy", name: "Omarchy (Auto)", appearance: null },
  { id: "ren", name: "Ren", appearance: "dark" },
  { id: "ren-light", name: "Ren Light", appearance: "light" },
  { id: "catpuccin-latte", name: "Catpuccin Latte", appearance: "light" },
  { id: "tokyonight", name: "Tokyo Night", appearance: "dark" },
  { id: "classic", name: "Classic", appearance: "dark" },
  { id: "nord", name: "Nord", appearance: "dark" },
  { id: "electric-blue", name: "Electric Blue", appearance: "light" },
  { id: "minimal", name: "Minimal Light", appearance: "light" },
] as const satisfies readonly { id: string; name: string; appearance: Appearance | null }[]

export type ThemeId = (typeof themes)[number]["id"]

export const THEME_IDS = themes.map((t) => t.id) as [ThemeId, ...ThemeId[]]

export type ThemeSource = "builtin" | "external" | "plugin"

export type ThemeDescriptor = {
  id: string
  name: string
  appearance: Appearance | null
  source: ThemeSource
}

export const BUILTIN_DESCRIPTORS: ThemeDescriptor[] = themes.map((t) => ({
  id: t.id,
  name: t.name,
  appearance: t.appearance,
  source: "builtin",
}))

export function getDeclaredAppearance(
  id: string,
  descriptors: readonly ThemeDescriptor[],
): Appearance | null {
  return descriptors.find((theme) => theme.id === id)?.appearance ?? null
}

/** The pair a fresh macOS install, and turning on "Match system appearance", start from. */
export const DEFAULT_SYSTEM_THEMES = {
  light: "ren-light",
  dark: "ren",
} as const satisfies Record<Appearance, ThemeId>

/** The theme a setting shows: the setting itself, or the pair's theme for the system appearance. */
export function resolveThemeSetting(setting: ThemeSetting, system: Appearance): string {
  return typeof setting === "string" ? setting : setting[system]
}
