// Restore persisted theme before React mounts to avoid a flash. A light/dark
// pair follows the OS; the window is unforced at launch, so the media query
// reports the system appearance.
const defaultTheme = document.body.dataset.defaultTheme || "ren"
let theme = defaultTheme
try {
  const setting = JSON.parse(localStorage.getItem("theme"))
  if (typeof setting === "string") {
    theme = setting
  } else if (typeof setting?.light === "string" && typeof setting?.dark === "string") {
    theme = matchMedia("(prefers-color-scheme: dark)").matches ? setting.dark : setting.light
  }
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
