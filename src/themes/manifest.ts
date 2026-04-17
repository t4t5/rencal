export const themes = [
  { id: "classic", name: "Classic", background: "#1a1b26" },
  { id: "ren", name: "Ren", background: "#131313" },
] as const

export type ThemeId = (typeof themes)[number]["id"]

export const THEME_IDS = themes.map((t) => t.id) as [ThemeId, ...ThemeId[]]
