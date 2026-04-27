export const themes = [
  { id: "classic", name: "Classic" },
  { id: "ren", name: "Ren" },
  { id: "catpuccin-latte", name: "Catpuccin Latte" },
  { id: "tokyonight", name: "Tokyo Night" },
  { id: "omarchy", name: "Omarchy" },
] as const

export type ThemeId = (typeof themes)[number]["id"]

export const THEME_IDS = themes.map((t) => t.id) as [ThemeId, ...ThemeId[]]
