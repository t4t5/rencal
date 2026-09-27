export type Appearance = "light" | "dark"

// `"both"` means the theme (a plugin theme) ships a light and a dark variant and
// shows the one matching the OS. `null` means the appearance is derived at
// runtime (e.g. omarchy, which inherits from the OS theme).
export type ThemeAppearance = Appearance | "both" | null

export const themes = [
  { id: "omarchy", name: "Omarchy (Auto)", appearance: null },
  { id: "ren", name: "Ren", appearance: "dark" },
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
  appearance: ThemeAppearance
  source: ThemeSource
}

export const BUILTIN_DESCRIPTORS: ThemeDescriptor[] = themes.map((t) => ({
  id: t.id,
  name: t.name,
  appearance: t.appearance,
  source: "builtin",
}))

export function getThemeAppearance(
  id: string,
  descriptors: readonly ThemeDescriptor[],
): ThemeAppearance {
  return descriptors.find((theme) => theme.id === id)?.appearance ?? null
}

/** The appearance a theme renders in, or null when it must be derived at runtime. */
export function resolveAppearance(
  id: string,
  descriptors: readonly ThemeDescriptor[],
  system: Appearance,
): Appearance | null {
  const appearance = getThemeAppearance(id, descriptors)
  return appearance === "both" ? system : appearance
}
