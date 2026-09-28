export type Appearance = "light" | "dark"

/** `adaptive` takes its appearance from a runtime palette (Omarchy's). */
export type ThemeAppearance = Appearance | "adaptive"

export const themes = [
  { id: "omarchy", name: "Omarchy (Auto)", appearance: "adaptive" },
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
  return declared === "adaptive" ? omarchyMode : declared
}
