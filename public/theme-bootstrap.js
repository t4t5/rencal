// Restore persisted theme before React mounts to avoid a flash. useTheme caches
// the theme to show for each OS appearance; the window is unforced at launch,
// so the media query reports the system appearance.
const defaultTheme = document.body.dataset.defaultTheme || "ren"
let theme = defaultTheme
try {
  const variants = JSON.parse(localStorage.getItem("themeVariants"))
  const variant = variants?.[matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"]
  // Before the variants cache existed, "theme" held the theme id itself.
  const stored = typeof variant === "string" ? variant : JSON.parse(localStorage.getItem("theme"))
  if (typeof stored === "string" && stored) theme = stored
} catch {}
document.body.dataset.theme = theme

// Apply that theme's last-known background so we don't flash a stale color
// before the CSS bundle (and any external-theme <style>) loads. Works for every
// theme because useTheme caches the resolved --background per theme.
try {
  const background = JSON.parse(localStorage.getItem("themeBackgrounds"))?.[theme]
  if (typeof background === "string") {
    document.body.style.setProperty("--background", background)
    document.documentElement.style.backgroundColor = background
  }
} catch {}
