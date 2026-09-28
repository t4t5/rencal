// Restore the persisted theme before React mounts to avoid a flash. The theme
// controller caches its settings (`themeSettings`) and each theme's background
// (`themeBackgrounds`); the window is unforced at launch, so the media query
// reports the OS. On Omarchy (its palette is cached) syncing shows the Omarchy
// theme, as resolveSync does. Defaults match DEFAULT_THEME_SETTINGS.
let settings = { mode: "system", single: "ren", light: "ren-light", dark: "ren" }
let onOmarchy = false
try {
  const stored = JSON.parse(localStorage.getItem("themeSettings"))
  if (stored && typeof stored === "object") settings = { ...settings, ...stored }
  onOmarchy = localStorage.getItem("omarchyColors") !== null
} catch {}
if (onOmarchy && settings.mode === "system")
  settings = { ...settings, mode: "single", single: "omarchy" }
const slot =
  settings.mode !== "system"
    ? "single"
    : matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light"
const theme = typeof settings[slot] === "string" && settings[slot] ? settings[slot] : "ren"
document.body.dataset.theme = theme

// Apply the theme's last-known background so we don't flash a stale color
// before the CSS bundle (and any external-theme <style>) loads.
try {
  const background = JSON.parse(localStorage.getItem("themeBackgrounds"))?.[theme]
  if (typeof background === "string") {
    document.body.style.setProperty("--background", background)
    document.documentElement.style.backgroundColor = background
  }
} catch {}
