export type Appearance = "light" | "dark"

// `appearance: null` means the theme's appearance is derived at runtime
// (e.g. omarchy, which inherits from the OS theme).
export const themes = [
  { id: "ren", name: "Ren", appearance: "dark" },
  { id: "omarchy", name: "Omarchy", appearance: null },
  { id: "catpuccin-latte", name: "Catpuccin Latte", appearance: "light" },
  { id: "tokyonight", name: "Tokyo Night", appearance: "dark" },
  { id: "classic", name: "Classic", appearance: "dark" },
] as const satisfies readonly { id: string; name: string; appearance: Appearance | null }[]

export type ThemeId = (typeof themes)[number]["id"]

export const THEME_IDS = themes.map((t) => t.id) as [ThemeId, ...ThemeId[]]

export function getDeclaredAppearance(id: ThemeId): Appearance | null {
  return themes.find((t) => t.id === id)?.appearance ?? null
}
