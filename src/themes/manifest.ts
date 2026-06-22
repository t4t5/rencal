export type Appearance = "light" | "dark"

// `appearance: null` means the theme's appearance is derived at runtime
// (e.g. omarchy, which inherits from the OS theme).
export const themes = [
  { id: "omarchy", name: "Omarchy (Auto)", appearance: null },
  { id: "ren", name: "Ren", appearance: "dark" },
  { id: "catpuccin-latte", name: "Catpuccin Latte", appearance: "light" },
  { id: "tokyonight", name: "Tokyo Night", appearance: "dark" },
  { id: "classic", name: "Classic", appearance: "dark" },
] as const satisfies readonly { id: string; name: string; appearance: Appearance | null }[]

export type ThemeId = (typeof themes)[number]["id"]

export const THEME_IDS = themes.map((t) => t.id) as [ThemeId, ...ThemeId[]]

// Built-in themes ship a declared appearance; user themes don't, so the active
// theme is identified by a plain string (built-in id or `user:<slug>`) and an
// unknown id simply falls through to the :root defaults.
export type ThemeSource = "builtin" | "external"

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

export function getDeclaredAppearance(id: string): Appearance | null {
  return (
    (themes as readonly { id: string; appearance: Appearance | null }[]).find((t) => t.id === id)
      ?.appearance ?? null
  )
}
