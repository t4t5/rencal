import type { ThemeSettings } from "@/lib/api"

export type Appearance = "light" | "dark"

/** `system` fits either slot: Omarchy's palette sets its own appearance and the OS's. */
export type ThemeAppearance = Appearance | "system"

export const APPEARANCES = ["light", "dark"] as const satisfies readonly Appearance[]

export const themes = [
  { id: "omarchy", name: "Omarchy (Auto)", appearance: "system" },
  { id: "ren", name: "Ren", appearance: "dark" },
  { id: "ren-light", name: "Ren Light", appearance: "light" },
  { id: "catpuccin-latte", name: "Catpuccin Latte", appearance: "light" },
  { id: "tokyonight", name: "Tokyo Night", appearance: "dark" },
  { id: "classic", name: "Classic", appearance: "dark" },
  { id: "nord", name: "Nord", appearance: "dark" },
  { id: "electric-blue", name: "Electric Blue", appearance: "light" },
  { id: "minimal", name: "Minimal Light", appearance: "light" },
] as const satisfies readonly { id: string; name: string; appearance: ThemeAppearance }[]

export type ThemeSource = "builtin" | "external" | "plugin"

export type ThemeDescriptor = {
  id: string
  name: string
  appearance: ThemeAppearance
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
): ThemeAppearance | null {
  return descriptors.find((theme) => theme.id === id)?.appearance ?? null
}

/** The appearance `id` paints with; null for an unknown theme, or Omarchy before its palette loads. */
export function getActiveAppearance(
  id: string,
  descriptors: readonly ThemeDescriptor[],
  omarchyMode: Appearance | null,
): Appearance | null {
  const declared = getDeclaredAppearance(id, descriptors)
  return declared === "system" ? omarchyMode : declared
}

// Keep in step with data-default-*-theme in index.html and rencal-config's default.
export const DEFAULT_THEME_SETTINGS: ThemeSettings = {
  mode: "system",
  light: "ren-light",
  dark: "ren",
}

/** Themes listed under a slot: those of its appearance, plus Omarchy's `system`. */
export function themesFor(
  slot: Appearance,
  descriptors: readonly ThemeDescriptor[],
): ThemeDescriptor[] {
  return descriptors.filter((theme) => theme.appearance === slot || theme.appearance === "system")
}
