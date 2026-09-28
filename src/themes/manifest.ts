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

/** Built-in themes that ship a light and a dark variant, shown as one card named after the family. */
const VARIANT_FAMILIES = [
  { id: "ren", name: "Ren", variants: { light: "ren-light", dark: "ren" } },
] as const satisfies readonly {
  id: ThemeId
  name: string
  variants: Record<Appearance, ThemeId>
}[]

/**
 * What the theme setting stores and settings shows as one card: a single
 * theme, or a family whose variant the appearance setting picks. A single
 * theme's family id is its theme id.
 */
export type ThemeFamily = {
  id: string
  name: string
  variants?: Record<Appearance, string>
}

/** The registry's themes as families, in display order: a family takes its first variant's place. */
export function getThemeFamilies(descriptors: readonly ThemeDescriptor[]): ThemeFamily[] {
  const families: ThemeFamily[] = []
  for (const theme of descriptors) {
    const family = VARIANT_FAMILIES.find(
      (f) => f.variants.light === theme.id || f.variants.dark === theme.id,
    )
    if (!family) families.push({ id: theme.id, name: theme.name })
    else if (!families.some((f) => f.id === family.id)) families.push(family)
  }
  return families
}

/** The theme id a family shows in `appearance`. Unknown ids (e.g. a user theme not loaded yet) pass through. */
export function resolveFamilyTheme(familyId: string, appearance: Appearance): string {
  return VARIANT_FAMILIES.find((f) => f.id === familyId)?.variants[appearance] ?? familyId
}

export function hasVariants(familyId: string): boolean {
  return VARIANT_FAMILIES.some((f) => f.id === familyId)
}
