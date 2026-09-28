export type Appearance = "light" | "dark"

export const themes = [
  { id: "ren", name: "Ren", appearance: "dark" },
  { id: "ren-light", name: "Ren Light", appearance: "light" },
  { id: "catpuccin-latte", name: "Catpuccin Latte", appearance: "light" },
  { id: "tokyonight", name: "Tokyo Night", appearance: "dark" },
  { id: "classic", name: "Classic", appearance: "dark" },
  { id: "nord", name: "Nord", appearance: "dark" },
  { id: "electric-blue", name: "Electric Blue", appearance: "light" },
  { id: "minimal", name: "Minimal Light", appearance: "light" },
] as const satisfies readonly { id: string; name: string; appearance: Appearance }[]

export type ThemeSource = "builtin" | "external" | "plugin"

export type ThemeDescriptor = {
  id: string
  name: string
  appearance: Appearance
  source: ThemeSource
}

export const BUILTIN_DESCRIPTORS: ThemeDescriptor[] = themes.map((t) => ({
  id: t.id,
  name: t.name,
  appearance: t.appearance,
  source: "builtin",
}))

// Painted from the desktop's palette, so it's registered only on Omarchy and
// shown by syncing with the system rather than picked for a slot.
export const OMARCHY_THEME_ID = "omarchy"

export const isOmarchy = (id: string) => id === OMARCHY_THEME_ID

export const omarchyDescriptor = (appearance: Appearance): ThemeDescriptor => ({
  id: OMARCHY_THEME_ID,
  name: "Omarchy (Auto)",
  appearance,
  source: "builtin",
})

export function getDeclaredAppearance(
  id: string,
  descriptors: readonly ThemeDescriptor[],
): Appearance | null {
  return descriptors.find((theme) => theme.id === id)?.appearance ?? null
}
