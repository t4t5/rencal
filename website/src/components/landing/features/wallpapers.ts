// Wallpapers from Omarchy's themes, behind the feature close-ups. `border` is
// the theme's accent, which Hyprland draws around the focused window.
export interface Wallpaper {
  src: string
  border: string
}

export const WALLPAPERS = {
  windingRoad: { src: "/wallpapers/tokyo-night-winding-road.webp", border: "#7aa2f7" },
  mountainMoon: { src: "/wallpapers/osaka-jade-mountain-moon.webp", border: "#509475" },
  theJourney: { src: "/wallpapers/retro-82-the-journey.webp", border: "#faa968" },
  newHorizons: { src: "/wallpapers/last-horizon-new-horizons.webp", border: "#b59790" },
  blackMoon: { src: "/wallpapers/nord-black-moon.webp", border: "#81a1c1" },
} satisfies Record<string, Wallpaper>

/** The wallpaper shown with each of the app's built-in themes, keyed by theme id. */
export const THEME_WALLPAPERS: Record<string, string> = {
  ren: "/wallpapers/ristretto-color-curves.webp",
  "catpuccin-latte": "/wallpapers/catppuccin-latte-color-fade.webp",
  tokyonight: "/wallpapers/tokyo-night-swirl-buck.webp",
  classic: "/wallpapers/hackerman-synth-scape.webp",
  nord: "/wallpapers/nord-city-view.webp",
  "electric-blue": "/wallpapers/lupine-elegant-blue-wave.webp",
  minimal: "/wallpapers/white-white.webp",
}
