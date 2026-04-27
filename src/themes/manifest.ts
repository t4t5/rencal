export const themes = [
  { id: "ren", name: "Ren" },
  { id: "omarchy", name: "Omarchy" },
  { id: "catpuccin-latte", name: "Catpuccin Latte" },
  { id: "tokyonight", name: "Tokyo Night" },
  { id: "classic", name: "Classic" },
] as const

export type ThemeId = (typeof themes)[number]["id"]

export const THEME_IDS = themes.map((t) => t.id) as [ThemeId, ...ThemeId[]]
